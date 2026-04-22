# User Guide

**Before you start:** confirm the app is deployed using the deployment guide at `Docs/DEPLOYMENT_GUIDE.md`.

This document summarizes the main user flows, UI controls, and administrative actions in the Specialization Explorer frontend. It reflects the current UI and behavior implemented in the frontend code (chat, prompts, practice generation, audio, and admin features).

| Index    | Description |
| -------- | ------- |
| [Getting Started](#getting-started) | Create an account and get started with the app |
| [Student View](#student-view) | Browse textbooks, use the Chat interface, and generate practice materials |
| [Administrator View](#administrator-view) | Admin dashboards: ingestion, moderation, AI settings, analytics |

---

## Getting Started

1. Open the hosted site (Amplify URL provided in the deployment process) or run the frontend locally.
---

## Student View
![image](./media/anonymous-pop-up.png)
![image](./media/home-page.png)
![image](./media/first-interaction.png)
![image](./media/requirements-averages.png)
![image](./media/suggestion-hallucination.png)
![image](./media/expanded-resources.png)

---

## Administrator View

Switch to Instructor mode via the Mode selector (top header). Instructors have access to the Material Editor and additional tools.

![image](./media/admin-log-in.png)
![image](./media/admin-dashboard.png)
![image](./media/admin-add-website.png)
![image](./media/admin-add-file.png)
![image](./media/admin-analytics.png)
![image](./media/admin-system-settings.png)
![image](./media/admin-system-settings-stack.png)
![image](./media/admin-messages-that-affect-text-gen.png)
![image](./media/admin-messages-that-do-not-affect-text-gen.png)
![image](./media/admin-message-versioning.png)
![image](./media/admin-chat-history.png)



## Additional Resources

- [Deployment Guide](./DEPLOYMENT_GUIDE.md)
- [Architecture Documentation](./ARCHITECTURE.md)
- [API Documentation](./API_DOCUMENTATION.pdf)