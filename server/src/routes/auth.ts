import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '../db.js';
import fs from 'fs';
import path from 'path';

const router = Router();

const authDebugEnabled = process.env.AUTH_DEBUG !== '0';

function authDebugLog(event: string, details: Record<string, unknown>) {
  if (!authDebugEnabled) return;
  console.log(`[auth] ${event}`, details);
}

// In-memory store for reset tokens (in production, use Redis or database)
const passwordResetTokens = new Map<string, { userId: string; expiresAt: Date }>();

// Validation schemas
const registerSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
  password: z.string().min(6),
});

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

// Generate JWT token
function generateToken(userId: string, username: string): string {
  const secret = process.env.JWT_SECRET || 'default-secret';
  return jwt.sign(
    { userId, username },
    secret,
    { expiresIn: '7d' }
  );
}

// Register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const data = registerSchema.parse(req.body);

    // Check if user exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ username: data.username }, { email: data.email }],
      },
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        username: data.username,
        email: data.email,
        passwordHash,
      },
      select: {
        id: true,
        username: true,
        email: true,
        createdAt: true,
      },
    });

    // Generate token
    const token = generateToken(user.id, user.username);

    res.status(201).json({
      user,
      token,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login
router.post('/login', async (req: Request, res: Response) => {
  try {
    authDebugLog('login.request_received', {
      contentType: req.headers['content-type'],
      hasBody: Boolean(req.body),
      bodyKeys: req.body && typeof req.body === 'object' ? Object.keys(req.body as Record<string, unknown>) : null,
      usernameType: typeof req.body?.username,
      passwordType: typeof req.body?.password,
      usernamePreview: typeof req.body?.username === 'string' ? `${req.body.username.slice(0, 3)}***` : null,
    });

    const data = loginSchema.parse(req.body);

    authDebugLog('login.validated_payload', {
      usernameLength: data.username.length,
      passwordLength: data.password.length,
    });

    // Find user
    authDebugLog('login.user_lookup_start', {
      username: data.username,
    });

    const user = await prisma.user.findUnique({
      where: { username: data.username },
    });

    authDebugLog('login.user_lookup_result', {
      foundUser: Boolean(user),
      userId: user?.id ?? null,
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const valid = await bcrypt.compare(data.password, user.passwordHash);
    authDebugLog('login.password_verification', {
      userId: user.id,
      passwordValid: valid,
    });

    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = generateToken(user.id, user.username);

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        createdAt: user.createdAt,
      },
      token,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      authDebugLog('login.validation_error', {
        issues: error.errors,
      });
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }

    authDebugLog('login.unhandled_error', {
      name: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
    });

    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify token
router.get('/verify', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const secret = process.env.JWT_SECRET || 'default-secret';

    const decoded = jwt.verify(token, secret) as { userId: string; username: string };

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        username: true,
        email: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    res.json({ user, token });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Request password reset
router.post('/reset-password-request', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
    });

    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({ message: 'If an account exists with this email, a reset link has been sent' });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store token
    passwordResetTokens.set(resetToken, { userId: user.id, expiresAt });

    // In production, send email with reset link
    // For now, return the token (development only)
    console.log(`Password reset token for ${user.username}: ${resetToken}`);

    res.json({ 
      message: 'If an account exists with this email, a reset link has been sent',
      // Remove this in production
      devToken: resetToken 
    });
  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reset password with token
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Verify token
    const tokenData = passwordResetTokens.get(token);

    if (!tokenData) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    if (tokenData.expiresAt < new Date()) {
      passwordResetTokens.delete(token);
      return res.status(400).json({ error: 'Reset token has expired' });
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update user password
    await prisma.user.update({
      where: { id: tokenData.userId },
      data: { passwordHash },
    });

    // Delete token
    passwordResetTokens.delete(token);

    res.json({ message: 'Password has been reset successfully' });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update player color in a session
router.patch('/sessions/:sessionId/player-color', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { userId, playerColor } = req.body;

    if (!userId || !playerColor) {
      return res.status(400).json({ error: 'userId and playerColor are required' });
    }

    // Validate color format
    if (!/^#[0-9A-Fa-f]{6}$/.test(playerColor)) {
      return res.status(400).json({ error: 'Invalid color format. Use #RRGGBB' });
    }

    // Update the player's color in the session
    const updatedPlayer = await prisma.sessionPlayer.update({
      where: {
        sessionId_userId: {
          sessionId,
          userId,
        },
      },
      data: {
        playerColor,
      },
    });

    res.json({ success: true, playerColor: updatedPlayer.playerColor });
  } catch (error) {
    console.error('Update player color error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Set session asset folder (GM only)
router.patch('/sessions/:sessionId/asset-folder', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { assetFolder } = req.body;
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization required' });
    }
    
    const token = authHeader.replace('Bearer ', '');
    const secret = process.env.JWT_SECRET || 'default-secret';
    
    let decoded: { userId: string; username: string };
    try {
      decoded = jwt.verify(token, secret) as { userId: string; username: string };
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    // Get session to verify GM
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    if (session.gmId !== decoded.userId) {
      return res.status(403).json({ error: 'Only GM can set asset folder' });
    }
    
    // Get current settings
    const currentSettings = (session.settings as any) || {};
    
    // Update settings with asset folder
    const updatedSettings = {
      ...currentSettings,
      assetFolder: assetFolder || '',
    };
    
    const updatedSession = await prisma.session.update({
      where: { id: sessionId },
      data: { settings: updatedSettings },
    });
    
    res.json({ success: true, assetFolder: (updatedSession.settings as any).assetFolder });
  } catch (error) {
    console.error('Update asset folder error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get session files from asset folder
router.get('/sessions/:sessionId/files', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { path: folderPath } = req.query;
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization required' });
    }
    
    const token = authHeader.replace('Bearer ', '');
    const secret = process.env.JWT_SECRET || 'default-secret';
    
    let decoded: { userId: string; username: string };
    try {
      decoded = jwt.verify(token, secret) as { userId: string; username: string };
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    // Get session
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const settings = (session.settings as any) || {};
    const assetFolders: Array<{path: string}> = settings.assetFolders || [];
    
    // If no folders configured, check for legacy single assetFolder
    const legacyFolder = settings.assetFolder;
    
    // If we have assetFolders or a legacy folder, use them
    const allFolders = legacyFolder && assetFolders.length === 0 
      ? [{ path: legacyFolder }] 
      : assetFolders;
    
    if (allFolders.length === 0) {
      return res.status(400).json({ error: 'No asset folder configured for this session. Ask the GM to configure an asset folder.', files: [] });
    }
    
    // Determine the requested path
    const requestedPath = folderPath ? folderPath.toString() : '';
    
    // Find which folder to use - check if the path starts with any configured folder
    let targetFolder = allFolders.find(f => 
      requestedPath === f.path || 
      requestedPath.startsWith(f.path + '/') ||
      (requestedPath === '' && f.path)
    );
    
    // If no match, use the first folder
    if (!targetFolder) {
      targetFolder = allFolders[0];
    }
    
    // Build full path
    let fullPath = targetFolder.path;
    if (requestedPath && requestedPath !== targetFolder.path) {
      // Remove the base folder from the requested path to get relative path
      const relativePath = requestedPath.replace(targetFolder.path, '').replace(/^[/\\]/, '');
      fullPath = path.join(targetFolder.path, relativePath);
    }
    
    // Security check: ensure path doesn't escape any allowed base folder
    const isAllowed = allFolders.some(f => fullPath.startsWith(f.path));
    
    if (!isAllowed) {
      return res.status(403).json({ error: 'Access denied: invalid path' });
    }
    
    // Check if path exists and is a directory
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Folder not found', files: [] });
    }
    
    const stats = fs.statSync(fullPath);
    if (!stats.isDirectory()) {
      return res.status(400).json({ error: 'Path is not a directory' });
    }
    
    // Read directory contents
    const entries = fs.readdirSync(fullPath, { withFileTypes: true });
    
    const files = entries.map(entry => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
      path: path.relative(targetFolder.path, path.join(fullPath, entry.name)),
    }));
    
    // Sort: directories first, then files, alphabetically
    files.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
    
    res.json({ files, basePath: targetFolder.path });
  } catch (error) {
    console.error('Get session files error:', error);
    res.status(500).json({ error: 'Internal server error', files: [] });
  }
});

// Save multiple asset folders (GM only)
router.patch('/sessions/:sessionId/asset-folders', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { assetFolders } = req.body;
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization required' });
    }
    
    const token = authHeader.replace('Bearer ', '');
    const secret = process.env.JWT_SECRET || 'default-secret';
    
    let decoded: { userId: string; username: string };
    try {
      decoded = jwt.verify(token, secret) as { userId: string; username: string };
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    // Get session to verify GM
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    if (session.gmId !== decoded.userId) {
      return res.status(403).json({ error: 'Only GM can set asset folders' });
    }
    
    // Get current settings
    const currentSettings = (session.settings as any) || {};
    
    // Update settings with asset folders
    const updatedSettings = {
      ...currentSettings,
      assetFolders: assetFolders || [],
    };
    
    const updatedSession = await prisma.session.update({
      where: { id: sessionId },
      data: { settings: updatedSettings },
    });
    
    res.json({ success: true, assetFolders: (updatedSession.settings as any).assetFolders });
  } catch (error) {
    console.error('Update asset folders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as authRouter };
