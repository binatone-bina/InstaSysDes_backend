ConnectSphere
The system is a high-performance, modular backend engine designed to support a scalable social networking platform. It handles user identity, social graphing, rich-media content distribution, dynamic feed aggregation, and zero-drop, real-time messaging with granular delivery tracking.

Microservices:

1. Auth Service (auth)
The Auth Service acts as the security gatekeeper for the entire application, managing user identity, registration, and session security.

Registration & Hashing: When a user signs up, the service captures their credentials and runs the password through a secure hashing algorithm (like bcrypt) before writing the record to the database. Plaintext passwords never touch the disk.

Token-Based Sessions: Upon a successful login, the service generates a stateless JSON Web Token (JWT) packed with the user's encrypted identification metadata (e.g., userId).

Secure Cookie Transport: To prevent Cross-Site Scripting (XSS) attacks, the service bypasses traditional local storage and injects the JWT directly into an HttpOnly, Secure browser cookie.

Global Middleware Guard: Every subsequent request to the backend passes through an authentication middleware that intercepts this cookie, verifies the token's signature, and extracts the user's identity into the request object (req.user) for downstream services to use.

2. Profile Service (profile)
The Profile Service separates a user's strict authentication credentials from their public-facing social identity.

Data Decoupling: It manages a dedicated profiles table that pairs one-to-one with the core users table. This keeps heavy metadata separate from the highly secure credentials table.

Metadata Management: It handles updates for customizable user elements like bios, profile pictures, and unique display names.

Dynamic Resolution Source: Instead of storing duplicate copies of a user's name across posts or chat messages, other services perform database joins against this profile table. This ensure that when a user updates their profile picture or name, the change updates instantly across the entire application.

3. Follow Service (follow)
The Follow Service builds and maps the relational social graph that connects your users together.

Directional Relationships: Social links are directional (User A following User B does not automatically mean User B follows User A). The service models this behavior using a dedicated junction table containing pairs of follower_id and following_id as foreign keys.

Graph Mutators: It exposes clean operations to create (follow) or destroy (unfollow) these relational rows safely.

Network Queries: It serves as the data engine that allows the frontend to compute follower counts, following lists, and social boundaries (e.g., verifying if two users are connected before allowing certain interactions).

4. Post Service (post)
The Post Service drives the content creation engine of the platform, processing text payloads and rich media.

Static Resource Routing: When a user creates a post with an image, the service coordinates with middleware to capture the file stream, save the asset locally into a structured /uploads directory, and expose it via static Express routing.

Relational Storage: The service writes a post record containing the textual data, the generated public URL of the uploaded media asset, and a hard foreign key mapping the post to the specific author's user_id.

Targeted Retrieval: It provides contextual endpoints to fetch a single specific post or compile an array of historical posts belonging exclusively to one individual's profile timeline.

5. Feed Service (feed)
The Feed Service is a heavy data-aggregation engine that synthesizes content across the social graph to build a personalized timeline.

Dynamic Social Merging: When a user requests their feed, this service intercepts their requestorId, queries the Follow Service to retrieve a list of all users they are currently following, and queries the database for all posts authored by those individuals plus the user's own posts.

Algorithmic Sorting: It merges and sorts this massive pool of post records in descending order based on their creation timestamps (created_at).

Cursor-Based Pagination: To prevent database read degradation, the service compiles the feed using strict cursor pagination. It yields a specific batch of posts (e.g., 20) along with a timestamp "cursor" representing the oldest post in that batch. When the user scrolls down, the frontend passes that cursor back, allowing the engine to fetch the next 20 posts without rescanning the entire database.

6. Chat Service (chat)
The Chat Service is a high-performance, hybrid network engine combining stateless HTTP API architectures with stateful, real-time WebSockets.

Durable Writes First: When a user hits send, the payload runs through an HTTP POST route that commits the message to PostgreSQL immediately. This ensures zero data loss, even if a user's internet drops a millisecond later.

Dual-State Broadcast Layer: Once saved to the database, the service fetches all other participants in that chat thread. It cross-references an active memory layer or Redis cluster to check if those participants are online. If they are, it bypasses HTTP entirely, hands the payload to a Singleton WebSocket Gateway, and blasts the message directly to their device over an active socket channel (RECEIVE_MESSAGE).

Offline Fallback Sync: If a recipient is offline, the WebSocket broadcast skips them. When that offline user eventually logs back into the app, their device fires an HTTP request to the getInbox endpoint to catch up on everything committed to PostgreSQL while they were away.

Granular Receipt Tracking: The service captures incoming WebSocket acknowledgements (MESSAGE_DELIVERED and MESSAGE_READ) from recipients, writes accurate timestamps to the database, and routes real-time status updates back to the original sender to turn grey ticks into blue ticks instantly.
