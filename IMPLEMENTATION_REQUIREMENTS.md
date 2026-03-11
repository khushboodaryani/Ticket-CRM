# Requirements Document: Transitioning to MultyComm Omnichannel Platform

To begin implementing the features outlined in the **MultyComm Engineering Blueprint**, we need to move beyond a single-server setup to a distributed, enterprise-grade infrastructure.

---

## 🏗️ 1. Infrastructure Requirements (DevOps)
The blueprint specifies a microservices-based architecture. You will need:

*   **Orchestration**: A **Kubernetes (K8s)** cluster (e.g., EKS on AWS, GKE on Google Cloud, or self-hosted).
*   **Message Broker**: **Apache Kafka** is mandatory for the "Async Backbone" (Section 3.1) to handle high-volume events.
*   **API Gateway**: **Kong** or **Envoy** to handle tenant resolution, authentication, and rate limiting at the edge.
*   **Containerization**: **Docker** for all backend microservices (Ticketing, SLA, Assignment, etc.).

---

## 🗄️ 2. Data Persistence Requirements
The current MySQL setup needs to expand to a multi-store model:

*   **Transactional**: **PostgreSQL** (preferred in the blueprint for its robust JSONB support for custom fields).
*   **Search Engine**: **OpenSearch** or **Elasticsearch** for high-speed ticket and KB searching.
*   **Object Storage**: **S3** or **MinIO** for storing call recordings, transcripts, and email attachments.
*   **Analytics**: **ClickHouse** for processing the 1,000,000 daily tickets into real-time dashboards.
*   **Caching**: **Redis** for session management and real-time cursor states.

---

## 🔌 3. External Integrations & APIs
To enable the "Omnichannel" features, you will need access to:

*   **Voice**: A **FreeSWITCH** server or a CPaaS provider (like Twilio/Plivo) to handle VoIP events and record calls.
*   **Messaging**:
    *   **WhatsApp Business API** (through a BSP like Twilio or Gupshup).
    *   **Meta Developer Account** for Instagram/Facebook messaging.
    *   **SMS Gateway** (e.g., Twilio, AWS SNS).
*   **Identity**: An **OIDC** provider (e.g., Keycloak, Auth0, or Okta) for enterprise SSO.
*   **AI**: API keys for **OpenAI** or **Anthropic** (or a local GPU cluster for Llama3) to handle classification and summarization.

---

## 🛠️ 4. Technical Stack Enhancements
You will need to introduce new languages/tools to the team:

*   **Backend**: While Express/Node is okay for some services, the blueprint recommends a mix of **Go** and **Java** for performance-critical components like the Routing and SLA engines (Section 3.1).
*   **Frontend**: Stay with **React** but move to **Next.js** for better performance and edge-side rendering of the agent console.
*   **Observability**: **Prometheus** (metrics) and **Grafana** (dashboards) must be integrated into every service.

---

## 📄 5. Project Management Prerequisites
*   **Secret Management**: **HashiCorp Vault** for secure storage of API keys and social media tokens.
*   **CI/CD Pipeline**: **ArgoCD** or **GitHub Actions** to automate deployments to Kubernetes.
*   **Development Workspace**: A dedicated environment for testing FreeSWITCH (VoIP) events, which requires public IP visibility for webhooks.

---

### 🚀 Recommendation for "Day 1"
Start by moving the current backend into **Docker containers** and setting up a **PostgreSQL** instance. This provides the most immediate path toward the "tenant isolation" requirements mentioned in the blueprint.
