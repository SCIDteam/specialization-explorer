import { useState, useEffect } from "react";
import { Save, Bot } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthService } from "@/functions/authService";
import WelcomeMessageEditor from "@/components/Admin/WelcomeMessageEditor";
import { getCurrentUser } from "aws-amplify/auth";

type SystemSettingsDTO = {
  // canonical frontend names
  max_messages_per_session: number;
  min_messages_before_suggest: number;
  max_characters_per_user_message: number;
  max_characters_per_ai_message: number;
  temperature: number;
  top_p: number;

  updated_at?: string;
  updated_by_email?: string | null;
};


type SystemSettingsAPIResponse = Partial<SystemSettingsDTO> & {
  max_characters_per_user_message?: number;
  max_characters_per_ai_message?: number;
};

const DEFAULT_SETTINGS: SystemSettingsDTO = {
  max_messages_per_session: 20,
  min_messages_before_suggest: 4,
  max_characters_per_user_message: 2000,
  max_characters_per_ai_message: 5000,
  temperature: 0.2,
  top_p: 0.9,
};

export default function SystemSettings() {
  const [settings, setSettings] = useState<SystemSettingsDTO>(DEFAULT_SETTINGS);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAdminCredentials = async () => {
    const user = await getCurrentUser();
    const email = user?.signInDetails?.loginId ?? null;
    setAdminEmail(email);
  }

  const fetchSystemSettings = async () => {
    try {
      setLoading(true);
      setError(null);

      const session = await AuthService.getAuthSession(true);
      const token = session.tokens.idToken;

      const res = await fetch(
        `${import.meta.env.VITE_API_ENDPOINT}/admin/system-settings`,
        {
          headers: {
            Authorization: token,
            "Content-Type": "application/json",
          },
        }
      );

      if (!res.ok) throw new Error("Failed to fetch system settings");

      const data: SystemSettingsAPIResponse = await res.json();

      setSettings({
        max_messages_per_session:
          data.max_messages_per_session ?? DEFAULT_SETTINGS.max_messages_per_session,
        min_messages_before_suggest:
          data.min_messages_before_suggest ?? DEFAULT_SETTINGS.min_messages_before_suggest,
        max_characters_per_user_message:
        data.max_characters_per_user_message ?? DEFAULT_SETTINGS.max_characters_per_user_message,
        max_characters_per_ai_message:
        data.max_characters_per_ai_message ?? DEFAULT_SETTINGS.max_characters_per_ai_message,
        temperature: data.temperature ?? DEFAULT_SETTINGS.temperature,
        top_p: data.top_p ?? DEFAULT_SETTINGS.top_p,
        updated_at: data.updated_at,
        updated_by_email: data.updated_by_email ?? null,
      });
    } catch (e) {
      console.error(e);
      setError("Failed to load system settings");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSystemSettings = async () => {
    try {
      setSaving(true);
      setError(null);

      const session = await AuthService.getAuthSession(true);
      const token = session.tokens.idToken;

      if (!adminEmail) {
        throw new Error("Missing admin email (not authenticated?)");
      }

      const payload = {
        max_messages_per_session: settings.max_messages_per_session,
        min_messages_before_suggest: settings.min_messages_before_suggest,
        max_characters_per_user_message: settings.max_characters_per_user_message,
        max_characters_per_ai_message: settings.max_characters_per_ai_message,
        temperature: settings.temperature,
        top_p: settings.top_p,
        updated_by_email: adminEmail,
      };

      const res = await fetch(
        `${import.meta.env.VITE_API_ENDPOINT}/admin/system-settings`,
        {
          method: "PUT",
          headers: {
            Authorization: token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) throw new Error("Failed to save system settings");

      await fetchSystemSettings();
    } catch (e) {
      console.error(e);
      setError("Failed to save system settings");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    fetchAdminCredentials();
    fetchSystemSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-8 max-w-7xl mx-auto animate-in fade-in duration-500">
      <div>
        <h2 className="text-3xl font-bold text-gray-900">System Settings</h2>
        <p className="text-gray-500 mt-1">
          Configure global platform settings including limits and AI behavior.
        </p>
      </div>

      <Card className="border-gray-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-[#2c5f7c]" />
            System Settings
          </CardTitle>
          <CardDescription>
            Configure global limits and model sampling behavior (stored in system_settings).
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#2c5f7c]" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="max-messages-per-session">
                    Max messages per session
                  </Label>
                  <Input
                    id="max-messages-per-session"
                    type="number"
                    min={1}
                    value={settings.max_messages_per_session}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        max_messages_per_session: Number(e.target.value),
                      }))
                    }
                  />
                  <p className="text-xs text-gray-500">
                    Hard cap on messages in a single chat session.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="min-messages-before-suggest">
                    Min messages before suggest
                  </Label>
                  <Input
                    id="min-messages-before-suggest"
                    type="number"
                    min={0}
                    value={settings.min_messages_before_suggest}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        min_messages_before_suggest: Number(e.target.value),
                      }))
                    }
                  />
                  <p className="text-xs text-gray-500">
                    Minimum back-and-forth before suggestion logic can activate.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="max-chars-user">
                    Max characters per user message
                  </Label>
                  <Input
                    id="max-chars-user"
                    type="number"
                    min={1}
                    value={settings.max_characters_per_user_message}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        max_characters_per_user_message: Number(e.target.value),
                      }))
                    }
                  />
                  <p className="text-xs text-gray-500">
                    Reject or truncate user messages above this length.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="max-chars-ai">
                    Max characters per AI message
                  </Label>
                  <Input
                    id="max-chars-ai"
                    type="number"
                    min={1}
                    value={settings.max_characters_per_ai_message}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        max_characters_per_ai_message: Number(e.target.value),
                      }))
                    }
                  />
                  <p className="text-xs text-gray-500">
                    Cap AI response length to avoid runaway outputs.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="temperature">Temperature</Label>
                  <Input
                    id="temperature"
                    type="number"
                    step="0.01"
                    min={0}
                    max={2}
                    value={settings.temperature}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        temperature: Number(e.target.value),
                      }))
                    }
                  />
                  <p className="text-xs text-gray-500">
                    Controls randomness. Typical range: 0–1 (allowed up to 2).
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="top-p">Top P</Label>
                  <Input
                    id="top-p"
                    type="number"
                    step="0.01"
                    min={0}
                    max={1}
                    value={settings.top_p}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        top_p: Number(e.target.value),
                      }))
                    }
                  />
                  <p className="text-xs text-gray-500">
                    Nucleus sampling. Typical range: 0.8–0.95.
                  </p>
                </div>
              </div>

              <div className="pt-2">
                <Button
                  onClick={handleSaveSystemSettings}
                  disabled={saving}
                  className="bg-[#2c5f7c] hover:bg-[#234d63]"
                >
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              </div>

              {(settings.updated_at || settings.updated_by_email !== undefined) && (
                <div className="text-xs text-gray-500 pt-2">
                  {settings.updated_at ? (
                    <div>Last updated: {new Date(settings.updated_at).toLocaleString()}</div>
                  ) : null}
                  {settings.updated_by_email ? <div>Updated by: {settings.updated_by_email}</div> : null}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Welcome Message Editor */}
      <WelcomeMessageEditor />
    </div>
  );
}
