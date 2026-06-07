# Ripple

Ripple is a real-time collaborative music creation and sequencing tool built on [SpacetimeDB](https://spacetimedb.com). It allows multiple users to jam together, create tracks, upload audio assets, and sequence MIDI—all synchronized seamlessly in real-time. 

Ripple leverages the [Strudel](https://strudel.cc/) audio engine for powerful synthesis and live-coding capabilities, entirely within the browser.

## Features

- **Real-time Collaboration:** Jam with your friends. Changes to tracks, blocks, and playback state are synchronized instantly using SpacetimeDB.
- **Collaborative Rooms:** Create and join rooms with unique URLs to collaborate on different projects.
- **Master & Personal Views:** See the shared "Master" view of the track or switch to your own personal view for independent auditioning.
- **Audio Asset Uploads:** Upload your own audio samples to SpacetimeDB. Ripple chunks and stores the audio data, distributing it to everyone in the room.
- **Strudel Integration:** Powered by Strudel for dynamic audio synthesis, sampling, and sequencing.
- **Multi-track Sequencing:** Arrange audio and MIDI blocks on multiple tracks, control volume, panning, mute, and solo states.
- **Automation:** Automate effects and parameters using bezier curves.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+ installed
- [SpacetimeDB CLI](https://spacetimedb.com/install) installed

## Getting Started

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the SpacetimeDB local server (if not already running):**
   ```bash
   spacetime start
   ```

3. **Publish the SpacetimeDB module:**
   ```bash
   npm run spacetime:publish:local
   ```
   *Note: Ensure your SpacetimeDB local server is running.*

4. **Generate the client bindings:**
   ```bash
   npm run spacetime:generate
   ```

5. **Start the development server:**
   ```bash
   npm run dev
   ```

6. **Open your app:**
   Navigate to [http://localhost:5173](http://localhost:5173) to start making music!

## Project Structure

```
ripple/
├── spacetimedb/          # SpacetimeDB Server Module (Backend logic)
│   └── src/
│       └── index.ts      # Database schema and reducers
├── src/                  # React Frontend (Client logic)
│   ├── App.tsx           # Main application and UI
│   ├── audioAssetCache.ts# Caching for downloaded audio chunks
│   ├── audioUpload.ts    # Audio file chunking and uploading logic
│   ├── audioRenderer.ts  # Web Audio API playback scheduling
│   ├── strudelEngine.ts  # Strudel integration
│   └── module_bindings/  # Auto-generated SpacetimeDB TypeScript bindings
├── package.json          # Project configuration and scripts
└── compose.ts / compose_simple.ts # Additional sequencing logic
```

## Available Scripts

- `npm run dev`: Starts the Vite development server.
- `npm run build`: Compiles TypeScript and builds the frontend for production.
- `npm run spacetime:generate`: Uses the SpacetimeDB CLI to generate TypeScript bindings from the module.
- `npm run spacetime:publish:local`: Publishes the backend module to your local SpacetimeDB instance.
- `npm run spacetime:publish`: Publishes the backend module to the SpacetimeDB main cloud.

## Learn More

- [SpacetimeDB Documentation](https://spacetimedb.com/docs)
- [SpacetimeDB TypeScript SDK](https://spacetimedb.com/docs/intro/core-concepts/clients/typescript-reference)
- [Strudel Documentation](https://strudel.cc/learn/getting-started/)
