const { Client } = require("@opensearch-project/opensearch");
const { AwsSigv4Signer } = require("@opensearch-project/opensearch/aws");
const { defaultProvider } = require("@aws-sdk/credential-provider-node");

const MAX_FORBIDDEN_RETRY_WINDOW_MS = 5 * 60 * 1000;
const FORBIDDEN_RETRY_SLEEP_MS = 15 * 1000;
const INDEX_STABILIZE_MAX_WINDOW_MS = 3 * 60 * 1000;
const INDEX_STABILIZE_POLL_MS = 10 * 1000;
const INDEX_STABILIZE_EXTRA_DELAY_MS = 20 * 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeEndpoint(endpoint) {
  const trimmed = String(endpoint || "").trim();
  if (!trimmed) {
    throw new Error("CollectionEndpoint is required");
  }
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withProtocol.replace(/\/$/, "");
}

function buildClient(endpoint, region) {
  const credentialProvider = defaultProvider();

  return new Client({
    ...AwsSigv4Signer({
      region,
      service: "aoss",
      getCredentials: () => credentialProvider(),
    }),
    node: endpoint,
    maxRetries: 0,
    requestTimeout: 30000,
  });
}

function extractStatusCode(error) {
  return error?.statusCode || error?.meta?.statusCode || 0;
}

function extractErrorText(error) {
  const body = error?.meta?.body;
  if (typeof body === "string") {
    return body;
  }
  if (body) {
    return JSON.stringify(body);
  }
  return String(error?.message || "");
}

function responseBodyValue(response) {
  if (typeof response === "boolean") {
    return response;
  }
  if (response && Object.prototype.hasOwnProperty.call(response, "body")) {
    return response.body;
  }
  return response;
}

async function indexExists(client, indexName) {
  const response = await client.indices.exists({ index: indexName });
  const value = responseBodyValue(response);

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof response?.statusCode === "number") {
    return response.statusCode === 200;
  }

  return Boolean(value);
}

async function ensureIndexWithPropagation(client, props) {
  const {
    indexName,
    vectorField,
    textField,
    metadataField,
    dimensions,
  } = props;

  const deadline = Date.now() + MAX_FORBIDDEN_RETRY_WINDOW_MS;
  let attempt = 0;

  const body = {
    settings: {
      index: {
        knn: true,
      },
    },
    mappings: {
      properties: {
        [vectorField]: {
          type: "knn_vector",
          dimension: dimensions,
          method: {
            engine: "faiss",
            name: "hnsw",
            space_type: "l2",
          },
        },
        [textField]: {
          type: "text",
        },
        [metadataField]: {
          type: "text",
          index: false,
        },
      },
    },
  };

  while (Date.now() < deadline) {
    attempt += 1;

    try {
      if (await indexExists(client, indexName)) {
        console.log(`Index '${indexName}' already exists. Skipping create.`);
        return;
      }

      await client.indices.create({
        index: indexName,
        body,
      });

      console.log(`Index '${indexName}' created successfully on attempt ${attempt}.`);
      return;
    } catch (error) {
      const statusCode = extractStatusCode(error);
      const errorText = extractErrorText(error);
      const forbidden = statusCode === 403 || /forbidden/i.test(errorText);
      const alreadyExists = /resource_already_exists_exception|already exists/i.test(errorText);

      if (alreadyExists) {
        console.log(`Index '${indexName}' already exists (race condition). Treating as success.`);
        return;
      }

      if (forbidden) {
        const secondsLeft = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
        console.log(
          `Attempt ${attempt} received Forbidden (403/ResponseError). ` +
          `Waiting 15s for AOSS policy propagation. Remaining retry window: ${secondsLeft}s.`
        );
        await sleep(FORBIDDEN_RETRY_SLEEP_MS);
        continue;
      }

      throw error;
    }
  }

  throw new Error(
    `Timed out after 5 minutes waiting for AOSS policy propagation while creating index '${indexName}'.`
  );
}

async function waitForIndexStabilization(client, indexName) {
  const deadline = Date.now() + INDEX_STABILIZE_MAX_WINDOW_MS;
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt += 1;
    try {
      const exists = await indexExists(client, indexName);
      if (!exists) {
        console.log(`Index stabilization attempt ${attempt}: index not visible yet.`);
        await sleep(INDEX_STABILIZE_POLL_MS);
        continue;
      }

      await client.indices.get({ index: indexName });
      console.log(`Index '${indexName}' is visible and retrievable. Applying final delay for Bedrock consistency.`);
      await sleep(INDEX_STABILIZE_EXTRA_DELAY_MS);
      return;
    } catch (error) {
      const statusCode = extractStatusCode(error);
      const errorText = extractErrorText(error);
      const transient = statusCode === 404 || statusCode === 403 || /no such index|forbidden/i.test(errorText);

      if (transient) {
        console.log(`Index stabilization attempt ${attempt}: status=${statusCode}, waiting for AOSS data-plane consistency.`);
        await sleep(INDEX_STABILIZE_POLL_MS);
        continue;
      }

      throw error;
    }
  }

  throw new Error(`Timed out waiting for index '${indexName}' to become visible to downstream services.`);
}

exports.handler = async (event) => {
  console.log("VectorIndexManager event:", JSON.stringify(event));

  const requestType = event?.RequestType;
  const existingPhysicalId = event?.PhysicalResourceId || "vector-index-custom-resource";

  if (requestType === "Delete") {
    return {
      PhysicalResourceId: existingPhysicalId,
      Data: {
        SkippedDelete: "true",
      },
    };
  }

  const props = event?.ResourceProperties || {};
  const endpoint = normalizeEndpoint(props.CollectionEndpoint);
  const region = props.Region;
  const indexName = props.IndexName;

  if (!region || !indexName) {
    throw new Error("Region and IndexName are required resource properties");
  }

  const client = buildClient(endpoint, region);

  await ensureIndexWithPropagation(client, {
    indexName,
    vectorField: props.VectorField,
    textField: props.TextField,
    metadataField: props.MetadataField,
    dimensions: Number(props.Dimensions),
  });

  await waitForIndexStabilization(client, indexName);

  return {
    PhysicalResourceId: existingPhysicalId === "vector-index-custom-resource"
      ? `${indexName}-vector-index`
      : existingPhysicalId,
    Data: {
      IndexName: indexName,
    },
  };
};
