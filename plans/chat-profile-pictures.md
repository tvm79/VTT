# Chat Profile Pictures Implementation Plan

## Overview
Add individual profile pictures to chat messages with the following logic:
- **GM**: Always use profile picture
- **Player with assigned token**: Use the token's image as avatar
- **Player without token**: Use profile picture as avatar

## Current State Analysis

### Available Data
- `userProfileImage`: Only stored for current user in the store (localStorage + store)
- `session.players`: Array of SessionPlayer objects - NO profile picture field
- `tokens`: Available in game store with `imageUrl` field
- `session.gmId`: GM user ID

### Required Fields
SessionPlayer interface needs a `profilePicture` field to store profile pictures for all players in the session.

## Implementation Steps

### 1. Add profilePicture to SessionPlayer type
**File**: `shared/src/index.ts`
- Add `profilePicture?: string` field to SessionPlayer interface

### 2. Add playerProfileImages to game store
**File**: `client/src/store/gameStore.ts`
- Add `playerProfileImages: Record<string, string>` to store state
- Add `setPlayerProfileImage(userId: string, imageUrl: string)` action
- Initialize as empty object

### 3. Update ChatPanel component
**File**: `client/src/components/ChatPanel.tsx`

Add helper function to get avatar for a message:
```typescript
const getAvatarForMessage = (userId: string, isGM: boolean) => {
  // For GM: always use profile picture
  if (isGM) {
    return playerProfileImages[userId] || null;
  }
  
  // Find player in session
  const player = players.find(p => p.userId === userId);
  if (!player) return null;
  
  // If player has controlled tokens, use first token's image
  if (player.controlledTokens && player.controlledTokens.length > 0) {
    const token = tokens.find(t => t.id === player.controlledTokens[0]);
    if (token?.imageUrl) return token.imageUrl;
  }
  
  // Otherwise use profile picture
  return playerProfileImages[userId] || null;
};
```

Update the message rendering to include avatar:
```tsx
<div className="chat-message">
  {getAvatarForMessage(msg.userId, msg.userId === session?.gmId) ? (
    <img 
      src={getAvatarForMessage(msg.userId, msg.userId === session?.gmId)} 
      className="chat-avatar" 
      alt={msg.username}
    />
  ) : (
    <div className="chat-avatar-placeholder">
      {msg.username.charAt(0).toUpperCase()}
    </div>
  )}
  {/* rest of message content */}
</div>
```

### 4. Add CSS styling for chat avatars
**File**: `client/src/App.css`

Add styles for:
- `.chat-avatar`: 32x32px, border-radius 50%, object-fit cover
- `.chat-avatar-placeholder`: 32x32px, border-radius 50%, background color, centered text
- Update `.chat-message` layout to accommodate avatar

### 5. Sync profile pictures when session loads (Optional enhancement)
**File**: `client/src/store/gameStore.ts`

When joining a session, need to get profile pictures for all players. This may require server-side changes.

## Files to Modify

1. `shared/src/index.ts` - Add profilePicture to SessionPlayer
2. `client/src/store/gameStore.ts` - Add playerProfileImages to state
3. `client/src/components/ChatPanel.tsx` - Display avatars with token/profile logic
4. `client/src/App.css` - Add avatar styling

## Notes

- Current implementation only stores profile picture locally (localStorage)
- For full functionality, server needs to store and return profile pictures for all users
- Initial implementation can work with just local profile picture storage
