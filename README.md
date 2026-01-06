# Agent Manager

A SvelteKit application with WebSocket support, PostgreSQL database via Drizzle ORM, and comprehensive testing.

## Tech Stack

- **Framework**: SvelteKit 2 with Svelte 5
- **Database**: PostgreSQL with Drizzle ORM
- **WebSocket**: sveltekit-ws for real-time communication
- **Testing**: Vitest with Playwright for browser testing
- **Runtime**: Node.js with adapter-node

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL database

### Installation

```sh
npm install
```

### Environment Setup

Copy the example environment file and configure your database:

```sh
cp .env.example .env
```

Edit `.env` with your PostgreSQL connection string:

```
DATABASE_URL=postgresql://user:password@localhost:5432/agent_manager
```

### Database Setup

Push the schema to your database:

```sh
npm run db:push
```

Or generate and run migrations:

```sh
npm run db:generate
npm run db:migrate
```

## Development

Start the development server with WebSocket support:

```sh
npm run dev
```

The WebSocket server is available at `ws://localhost:5173/ws`.

## Testing

Run all tests:

```sh
npm test
```

Run tests in watch mode:

```sh
npm run test:watch
```

### Test Structure

- **Unit tests**: `src/**/*.spec.ts` - Run in Node environment
- **Component tests**: `src/**/*.svelte.spec.ts` - Run in Playwright browser

## Production

### Build

```sh
npm run build
```

### Run Production Server

The production server uses Express with WebSocket support:

```sh
node server.js
```

Or with a custom port:

```sh
PORT=8080 node server.js
```

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["node", "server.js"]
```

## WebSocket API

Connect to `/ws` endpoint. Messages use JSON format:

```typescript
interface WSMessage {
  type: string;
  data: any;
  timestamp?: number;
}
```

### Message Types

| Type | Direction | Description |
|------|-----------|-------------|
| `welcome` | Server -> Client | Sent on connection with connectionId |
| `echo` | Client -> Server | Server echoes back the data |
| `broadcast` | Client -> Server | Broadcasts data to all other clients |
| `error` | Server -> Client | Error response for unknown message types |

### Example Client

```typescript
const ws = new WebSocket('ws://localhost:5173/ws');

ws.onopen = () => {
  console.log('Connected');
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message);
};

// Send echo message
ws.send(JSON.stringify({ type: 'echo', data: { text: 'Hello' } }));

// Broadcast to others
ws.send(JSON.stringify({ type: 'broadcast', data: { text: 'Hello everyone' } }));
```

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm test` | Run all tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run check` | Run svelte-check |
| `npm run db:generate` | Generate Drizzle migrations |
| `npm run db:migrate` | Run database migrations |
| `npm run db:push` | Push schema to database |
| `npm run db:studio` | Open Drizzle Studio |

## Project Structure

```
src/
├── lib/
│   ├── server/
│   │   ├── db/           # Drizzle database setup
│   │   └── websocket/    # WebSocket tests
│   └── index.ts
├── routes/
│   ├── +layout.svelte
│   └── +page.svelte
├── app.d.ts
└── app.html
```
