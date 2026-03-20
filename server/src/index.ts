import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

// Database
import { prisma } from './db.js';

// WebSocket handlers
import { setupWebSocketHandlers } from './websocket/handlers.js';

// Auth routes
import { authRouter } from './routes/auth.js';

// Data module routes
import { dataRouter } from './routes/data.js';

// Asset routes
import { assetsRouter } from './routes/assets.js';

// Types
import type { ServerToClientMessage, ClientToServerMessage } from '../../shared/src/index.js';

const app = express();
const httpServer = createServer(app);

// Socket.io setup
const io = new Server<ClientToServerMessage, ServerToClientMessage>(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
  // Increase max payload size and enable WebSocket
  maxHttpBufferSize: 10 * 1024 * 1024, // 10MB
  transports: ['websocket', 'polling'],
  allowUpgrades: true,
});

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Audio file uploads
const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
const audioUploadDir = process.env.AUDIO_UPLOAD_DIR || path.join(process.cwd(), 'uploads', 'audio');

// Create audio subdirectories
const audioCategories = ['music', 'ambience', 'sfx'];
audioCategories.forEach(category => {
  const dir = path.join(audioUploadDir, category);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Ensure main upload directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Helper function to calculate SHA-256 hash of a file buffer
function calculateFileHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// Helper function to find existing file by hash
function findExistingFile(hash: string, ext: string): string | null {
  const files = fs.readdirSync(uploadDir);
  for (const file of files) {
    // Check if file starts with the hash (we store files as {hash}_{uuid}.{ext})
    if (file.startsWith(hash)) {
      return file;
    }
  }
  return null;
}

// Allowed audio extensions for upload
const ALLOWED_AUDIO_EXTENSIONS = ['.mp3', '.ogg', '.wav', '.webm', '.m4a', '.flac', '.aac'];

const audioStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Default to 'ambience' category if not specified
    const category = req.body.category || 'ambience';
    const validCategory = audioCategories.includes(category) ? category : 'ambience';
    const destDir = path.join(audioUploadDir, validCategory);
    cb(null, destDir);
  },
  filename: (req, file, cb) => {
    // Sanitize filename: remove special chars, replace spaces with dashes
    const sanitizedName = file.originalname
      .replace(/[^a-zA-Z0-9._-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    // Prefix with timestamp to avoid collisions
    const timestamp = Date.now();
    cb(null, `${timestamp}-${sanitizedName}`);
  },
});

const audioUpload = multer({
  storage: audioStorage,
  limits: {
    fileSize: parseInt(process.env.MAX_AUDIO_FILE_SIZE || '104857600'), // 100MB default
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_AUDIO_EXTENSIONS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Allowed: ${ALLOWED_AUDIO_EXTENSIONS.join(', ')}`));
    }
  },
});

// Audio upload endpoint
app.post('/api/upload-audio', audioUpload.array('files'), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: 'No files uploaded' });
    }

    const files = req.files as Express.Multer.File[];
    const uploadedFiles = files.map(file => ({
      originalName: file.originalname,
      filename: file.filename,
      path: `/uploads/audio/${path.basename(file.destination || '')}/${file.filename}`,
    }));

    console.log(`🎵 Audio files uploaded: ${uploadedFiles.length}`);

    res.json({
      success: true,
      files: uploadedFiles,
    });
  } catch (error) {
    console.error('Error processing audio upload:', error);
    res.status(500).json({ success: false, error: 'Failed to process upload' });
  }
});

// Image upload storage (for character portraits, etc.)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // We'll handle the actual naming in the upload handler after calculating hash
    cb(null, `${uuidv4()}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'),
  },
  fileFilter: (req, file, cb) => {
    // Only allow images
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// Static files for uploads (including audio)
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Static files for game assets
const assetsPath = path.join(process.cwd(), 'assets');
if (fs.existsSync(assetsPath)) {
  app.use('/assets', express.static(assetsPath, {
    maxAge: '1y',
  }));
  console.log(`📁 Serving assets from: ${assetsPath}`);
}

// API Routes - these must be registered BEFORE the SPA catch-all
app.use('/api/auth', authRouter);
app.use('/api/data', dataRouter);
app.use('/api/assets', assetsRouter);

// Serve static client files if they exist (must be after API routes)
const clientDistPath = path.join(__dirname, '../../client/dist');
if (fs.existsSync(clientDistPath)) {
  console.log(`📦 Serving client from: ${clientDistPath}`);
  
  // Serve static assets with proper caching
  app.use('/assets', express.static(path.join(clientDistPath, 'assets'), {
    maxAge: '1y',
  }));
  
  // Serve index.html for client-side routes (but not API)
  app.get('/', (_req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
  
  // Additional direct routes for SPA - serve index.html for known client routes
  app.get('/login', (_req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
  app.get('/register', (_req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
  app.get('/session/:id', (_req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// File upload endpoint - with duplicate detection
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    // Calculate hash of the uploaded file
    const fileBuffer = fs.readFileSync(req.file.path);
    const fileHash = calculateFileHash(fileBuffer);
    const ext = path.extname(req.file.originalname);

    // Check if a file with the same hash already exists
    const existingFile = findExistingFile(fileHash, ext);

    if (existingFile) {
      // Delete the newly uploaded duplicate file
      fs.unlinkSync(req.file.path);
      console.log(`📸 Duplicate file detected, using existing: ${existingFile}`);
      const fileUrl = `/uploads/${existingFile}`;
      return res.json({ 
        url: fileUrl, 
        filename: existingFile,
        duplicate: true // Flag to indicate this was a duplicate
      });
    }

    // No duplicate found - rename the file to include its hash
    const newFilename = `${fileHash}_${uuidv4()}${ext}`;
    const newPath = path.join(uploadDir, newFilename);
    fs.renameSync(req.file.path, newPath);

    console.log(`📸 New file uploaded: ${newFilename}`);
    const fileUrl = `/uploads/${newFilename}`;
    res.json({ url: fileUrl, filename: newFilename, duplicate: false });
  } catch (error) {
    console.error('Error processing upload:', error);
    // If something goes wrong, at least return the original file
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ url: fileUrl, filename: req.file.filename });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Setup WebSocket handlers
setupWebSocketHandlers(io);

// Start server
const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`🚀 VTT Server running on port ${PORT}`);
  console.log(`📁 Upload directory: ${uploadDir}`);
  console.log(`🌐 CORS origin: ${process.env.CORS_ORIGIN || 'http://localhost:5173'}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await prisma.$disconnect();
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export { io, prisma };
