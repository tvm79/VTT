// Shared types for VTT application
// ====================
// Constants
// ====================
export const GRID_TYPES = ['square', 'hex'];
export const DEFAULT_GRID_SIZE = 50;
export const DEFAULT_BOARD_WIDTH = 2000;
export const DEFAULT_BOARD_HEIGHT = 2000;
export const MAX_TOKEN_SIZE = 5;
export const ROOM_CODE_LENGTH = 8;
export const DEFAULT_COLOR_SCHEMES = [
    {
        id: 'classic',
        name: 'Classic Dark',
        primary: '#4a5568',
        secondary: '#2d3748',
        accent: '#ed8936',
        background: '#1a202c',
        surface: '#2d3748',
        text: '#f7fafc',
        textSecondary: '#a0aec0',
        gridColor: 'rgba(255, 255, 255, 0.15)',
        gridBackground: 'transparent'
    },
    {
        id: 'nord',
        name: 'Nord',
        primary: '#5e81ac',
        secondary: '#434c5e',
        accent: '#88c0d0',
        background: '#2e3440',
        surface: '#3b4252',
        text: '#eceff4',
        textSecondary: '#d8dee9',
        gridColor: 'rgba(136, 192, 208, 0.1)',
        gridBackground: 'transparent'
    },
    {
        id: 'gruvbox',
        name: 'Gruvbox',
        primary: '#cc241d',
        secondary: '#98971a',
        accent: '#fabd2f',
        background: '#282828',
        surface: '#3c3836',
        text: '#ebdbb2',
        textSecondary: '#d5c4a1',
        gridColor: 'rgba(250, 189, 47, 0.1)',
        gridBackground: 'transparent'
    },
    {
        id: 'dracula',
        name: 'Dracula',
        primary: '#bd93f9',
        secondary: '#6272a4',
        accent: '#ff79c6',
        background: '#282a36',
        surface: '#44475a',
        text: '#f8f8f2',
        textSecondary: '#bfc7d5',
        gridColor: 'rgba(189, 147, 249, 0.15)',
        gridBackground: 'transparent'
    },
    {
        id: 'monokai',
        name: 'Monokai',
        primary: '#f92672',
        secondary: '#ae81ff',
        accent: '#a1fe66',
        background: '#272822',
        surface: '#3e3d32',
        text: '#f8f8f2',
        textSecondary: '#cfcfc2',
        gridColor: 'rgba(166, 226, 46, 0.1)',
        gridBackground: 'transparent'
    },
    {
        id: 'one-dark',
        name: 'One Dark',
        primary: '#61afef',
        secondary: '#c678dd',
        accent: '#98c379',
        background: '#282c34',
        surface: '#21252b',
        text: '#abb2bf',
        textSecondary: '#5c6370',
        gridColor: 'rgba(97, 175, 239, 0.1)',
        gridBackground: 'transparent'
    },
    {
        id: 'material-dark',
        name: 'Material Dark',
        primary: '#82aaff',
        secondary: '#c792ea',
        accent: '#c3e88d',
        background: '#1a1b26',
        surface: '#24283b',
        text: '#a9b1d6',
        textSecondary: '#565f89',
        gridColor: 'rgba(130, 170, 255, 0.1)',
        gridBackground: 'transparent'
    },
    {
        id: 'carbon',
        name: 'Carbon',
        primary: '#78a659',
        secondary: '#519aba',
        accent: '#e3c58e',
        background: '#171717',
        surface: '#262626',
        text: '#d4d4d4',
        textSecondary: '#8c8c8c',
        gridColor: 'rgba(120, 166, 89, 0.1)',
        gridBackground: 'transparent'
    },
    {
        id: 'deep-blue',
        name: 'Deep Blue',
        primary: '#7aa2f7',
        secondary: '#bb9af7',
        accent: '#7dcfff',
        background: '#0f0f23',
        surface: '#1a1b2e',
        text: '#a9b1d6',
        textSecondary: '#565f89',
        gridColor: 'rgba(122, 162, 247, 0.1)',
        gridBackground: 'transparent'
    },
    {
        id: 'night-owl',
        name: 'Night Owl',
        primary: '#82aaff',
        secondary: '#c792ea',
        accent: '#c3e88d',
        background: '#011627',
        surface: '#0b2942',
        text: '#d6deeb',
        textSecondary: '#637777',
        gridColor: 'rgba(130, 170, 255, 0.1)',
        gridBackground: 'transparent',
        fontFamily: 'JetBrains Mono, monospace'
    },
    {
        id: 'synthwave',
        name: 'Synthwave 84',
        primary: '#f75189',
        secondary: '#bd93f9',
        accent: '#f7718c',
        background: '#241b2f',
        surface: '#2d1b3d',
        text: '#f7d4ff',
        textSecondary: '#9d8bb4',
        gridColor: 'rgba(247, 113, 140, 0.15)',
        gridBackground: 'transparent',
        fontFamily: 'Space Mono, monospace'
    },
    {
        id: 'tokyo-night',
        name: 'Tokyo Night',
        primary: '#7aa2f7',
        secondary: '#bb9af7',
        accent: '#7dcfff',
        background: '#1a1b26',
        surface: '#24283b',
        text: '#c0caf5',
        textSecondary: '#565f89',
        gridColor: 'rgba(122, 162, 247, 0.1)',
        gridBackground: 'transparent',
        fontFamily: 'Fira Code, monospace'
    },
    {
        id: 'hyper',
        name: 'Hyper Dark',
        primary: '#fc6d6e',
        secondary: '#a167e5',
        accent: '#6cff95',
        background: '#0d0d0d',
        surface: '#1a1a1a',
        text: '#ffffff',
        textSecondary: '#666666',
        gridColor: 'rgba(108, 255, 149, 0.1)',
        gridBackground: 'transparent',
        fontFamily: 'Menlo, monospace'
    },
    {
        id: 'obsidian',
        name: 'Obsidian',
        primary: '#6b8afd',
        secondary: '#9d7cd8',
        accent: '#9ece6a',
        background: '#0d1117',
        surface: '#161b22',
        text: '#c9d1d9',
        textSecondary: '#8b949e',
        gridColor: 'rgba(107, 138, 253, 0.1)',
        gridBackground: 'transparent',
        fontFamily: 'SF Mono, Monaco, monospace'
    }
];
//# sourceMappingURL=index.js.map