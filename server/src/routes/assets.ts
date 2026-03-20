import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

const router = Router();

// Assets directory - use server/assets folder
const assetsDir = path.join(process.cwd(), 'assets');
const thumbsDir = path.join(assetsDir, '_thumbs');

// Ensure assets directories exist
const assetCategories = ['maps', 'tokens', 'portraits', 'items', 'audio/music', 'audio/sfx', 'handouts'];
assetCategories.forEach(category => {
  const dir = path.join(assetsDir, category);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Ensure thumbs directory exists
if (!fs.existsSync(thumbsDir)) {
  fs.mkdirSync(thumbsDir, { recursive: true });
}

// Allowed file extensions by category
const ALLOWED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif'];
const ALLOWED_AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.webm'];
const ALLOWED_VIDEO_EXTENSIONS = ['.mp4', '.webm'];
const REMOTE_IMAGE_PROXY_ALLOWLIST = new Set([
  '5e.tools',
  'raw.githubusercontent.com',
  '5etools-mirror-3.github.io',
]);

// Get file type based on extension
function getFileType(ext: string): 'image' | 'audio' | 'video' | 'other' {
  const lowerExt = ext.toLowerCase();
  if (ALLOWED_IMAGE_EXTENSIONS.includes(lowerExt)) return 'image';
  if (ALLOWED_AUDIO_EXTENSIONS.includes(lowerExt)) return 'audio';
  if (ALLOWED_VIDEO_EXTENSIONS.includes(lowerExt)) return 'video';
  return 'other';
}

// Multer storage for asset uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Use req.body.path if available, otherwise default to /tokens
    const uploadPath = (req.body && req.body.path) ? req.body.path : '/tokens';
    console.log('=== SERVER UPLOAD PATH ===');
    console.log('req.body:', req.body);
    console.log('uploadPath:', uploadPath);
    // Sanitize path to prevent directory traversal
    const sanitizedPath = uploadPath.replace(/[^a-zA-Z0-9/_-]/g, '').replace(/^\/+/, '');
    const destDir = path.join(assetsDir, sanitizedPath);
    
    // Ensure directory exists
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    cb(null, destDir);
  },
  filename: (req, file, cb) => {
    // Sanitize filename: remove special chars, replace spaces with dashes
    const sanitizedName = file.originalname
      .replace(/[^a-zA-Z0-9._-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    cb(null, sanitizedName);
  },
});

// Multer storage for asset uploads - use memory storage so req.body is available in route handler
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

// List allowed extensions
function getAllowedExtensions(category?: string): string[] {
  switch (category) {
    case 'image':
      return ALLOWED_IMAGE_EXTENSIONS;
    case 'audio':
      return ALLOWED_AUDIO_EXTENSIONS;
    case 'video':
      return ALLOWED_VIDEO_EXTENSIONS;
    default:
      return [...ALLOWED_IMAGE_EXTENSIONS, ...ALLOWED_AUDIO_EXTENSIONS, ...ALLOWED_VIDEO_EXTENSIONS];
  }
}

// GET /api/assets - List folder contents
router.get('/', async (req: Request, res: Response) => {
  try {
    const requestPath = req.query.path as string || '/tokens';
    // Sanitize path to prevent directory traversal
    const sanitizedPath = requestPath.replace(/[^a-zA-Z0-9/_-]/g, '').replace(/^\/+/, '');
    const fullPath = path.join(assetsDir, sanitizedPath);

    // Security check: ensure path is within assets directory
    if (!fullPath.startsWith(assetsDir)) {
      return res.status(403).json({ error: 'Invalid path' });
    }

    // Check if directory exists
    if (!fs.existsSync(fullPath)) {
      return res.json({ path: requestPath, folders: [], files: [] });
    }

    const entries = fs.readdirSync(fullPath, { withFileTypes: true });
    
    const folders: string[] = [];
    const files: Array<{
      name: string;
      type: string;
      url: string;
      thumb?: string;
    }> = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Don't show _thumbs in folder list
        if (!entry.name.startsWith('_')) {
          folders.push(entry.name);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        const fileType = getFileType(ext);
        
        const filePath = path.join(sanitizedPath, entry.name);
        const fileUrl = `/assets/${filePath.replace(/\\/g, '/')}`;
        
        const fileInfo: {
          name: string;
          type: string;
          url: string;
          thumb?: string;
        } = {
          name: entry.name,
          type: fileType,
          url: fileUrl,
        };

        // Add thumbnail for images
        if (fileType === 'image') {
          const thumbName = path.basename(entry.name, ext) + '.webp';
          const thumbPath = path.join('_thumbs', thumbName);
          fileInfo.thumb = `/assets/${thumbPath.replace(/\\/g, '/')}`;
        }

        files.push(fileInfo);
      }
    }

    // Sort: folders first, then files alphabetically
    folders.sort((a, b) => a.localeCompare(b));
    files.sort((a, b) => a.name.localeCompare(b.name));

    res.json({ path: requestPath, folders, files });
  } catch (error) {
    console.error('Error listing assets:', error);
    res.status(500).json({ error: 'Failed to list assets' });
  }
});

async function handleProxyImageRequest(req: Request, res: Response): Promise<Response | void> {
  try {
    const target = String(req.query.url || '').trim();
    if (!target) {
      return res.status(400).json({ error: 'Missing url query parameter' });
    }

    let parsed: URL;
    try {
      parsed = new URL(target);
    } catch {
      return res.status(400).json({ error: 'Invalid url' });
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return res.status(400).json({ error: 'Only http/https URLs are supported' });
    }

    const host = parsed.hostname.toLowerCase();
    if (!REMOTE_IMAGE_PROXY_ALLOWLIST.has(host)) {
      return res.status(403).json({ error: `Host not allowed: ${host}` });
    }

    const response = await fetch(parsed.toString(), { redirect: 'follow' });
    if (!response.ok) {
      return res.status(response.status).json({
        error: `Failed to fetch remote image (${response.status})`,
      });
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().startsWith('image/')) {
      return res.status(415).json({ error: `Unsupported content type: ${contentType || 'unknown'}` });
    }

    const arrayBuffer = await response.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.send(imageBuffer);
  } catch (error) {
    console.error('Error proxying remote image:', error);
    return res.status(500).json({ error: 'Failed to proxy remote image' });
  }
}

// GET /api/assets/proxy-image?url=<encoded-remote-image-url>
// GET /api/assets/proxy-image.webp?url=<encoded-remote-image-url>
// Proxies trusted remote images to avoid browser CORS failures in PIXI loaders.
router.get('/proxy-image', handleProxyImageRequest);
router.get('/proxy-image.:ext', handleProxyImageRequest);

// POST /api/assets/upload - Upload file
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    // Get path from query param first (most reliable), then body
    const requestedPath = (req.query && req.query.path as string) || req.body.path || '/tokens';
    
    // Sanitize and resolve destination path
    const safePath = requestedPath.replace(/[^a-zA-Z0-9/_-]/g, '').replace(/^\/+/, '');
    const destination = path.join(assetsDir, safePath);
    
    // Ensure destination directory exists
    if (!fs.existsSync(destination)) {
      fs.mkdirSync(destination, { recursive: true });
    }
    
    // Sanitize filename
    const sanitizedName = req.file.originalname
      .replace(/[^a-zA-Z0-9._-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    
    const filePath = path.join(destination, sanitizedName);
    
    // Save the file from buffer
    fs.writeFileSync(filePath, req.file.buffer);
    
    const ext = path.extname(req.file.originalname).toLowerCase();
    const fileType = getFileType(ext);
    const fileUrl = `/assets/${path.join(safePath, sanitizedName).replace(/\\/g, '/')}`;

    // Generate thumbnail for images
    let thumbUrl: string | undefined;
    if (fileType === 'image') {
      try {
        const thumbName = path.basename(sanitizedName, ext) + '.webp';
        const thumbPath = path.join(thumbsDir, thumbName);
        
        await sharp(filePath)
          .resize(256, 256, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 80 })
          .toFile(thumbPath);
        
        thumbUrl = `/assets/_thumbs/${thumbName}`;
        console.log(`🖼️ Thumbnail created: ${thumbName}`);
      } catch (thumbError) {
        console.error('Error creating thumbnail:', thumbError);
      }
    }

    console.log(`📁 Asset uploaded: ${sanitizedName} to ${requestedPath}`);

    res.json({
      success: true,
      file: {
        name: sanitizedName,
        type: fileType,
        url: fileUrl,
        thumb: thumbUrl,
      },
    });
  } catch (error) {
    console.error('Error uploading asset:', error);
    res.status(500).json({ success: false, error: 'Failed to upload asset' });
  }
});

// DELETE /api/assets - Delete file
router.delete('/', async (req: Request, res: Response) => {
  try {
    const filePath = req.body.path;
    
    if (!filePath) {
      return res.status(400).json({ success: false, error: 'No file path provided' });
    }

    // Sanitize path to prevent directory traversal
    // Remove /assets prefix if present
    const relativePath = filePath.replace(/^\/assets\//, '').replace(/^assets\//, '');
    const sanitizedPath = relativePath.replace(/[^a-zA-Z0-9/_.-]/g, '');
    
    const fullPath = path.join(assetsDir, sanitizedPath);
    const thumbName = path.basename(sanitizedPath, path.extname(sanitizedPath)) + '.webp';
    const thumbPath = path.join(thumbsDir, thumbName);

    // Security check: ensure path is within assets directory
    if (!fullPath.startsWith(assetsDir)) {
      return res.status(403).json({ success: false, error: 'Invalid path' });
    }

    // Check if file exists
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    // Delete the file
    fs.unlinkSync(fullPath);
    console.log(`🗑️ Asset deleted: ${sanitizedPath}`);

    // Delete thumbnail if exists
    if (fs.existsSync(thumbPath)) {
      fs.unlinkSync(thumbPath);
      console.log(`🗑️ Thumbnail deleted: ${thumbName}`);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting asset:', error);
    res.status(500).json({ success: false, error: 'Failed to delete asset' });
  }
});

export const assetsRouter = router;
