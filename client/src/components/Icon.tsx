import { FontAwesomeIcon, FontAwesomeIconProps } from '@fortawesome/react-fontawesome';
import { CSSProperties } from 'react';
import { 
  faDiceD20,          // 🎲
  faTheaterMasks,     // 🎭
  faImage,            // 🖼️
  faCog,              // ⚙️
  faHandPointer,      // ✋
  faRuler,            // 📏 📐
  faCloud,            // 🌫️
  faCloudRain,        // 🌧️
  faSnowflake,        // ❄️
  faSmog,             // 🌫️ fog
  faMapMarker,        // 📍
  faLayerGroup,       // 📋
  faTag,              // 🏷️
  faSmile,            // 😀
  faTimesCircle,      // 🚫
  faEye,              // 👁️
  faPen,              // ✏️
  faHeart,            // ❤️
  faTint,             // 💙 (water/drop for mana)
  faPlus,             // ➕
  faTrash,            // 🗑️
  faBorderAll,        // 🧱 (tiles)
  faPalette,          // 🏞️ (background color)
  faBorderNone,       // 🌐 (grid color)
  faUserSecret,       // ✨ (invisible)
  faSkull,            // 💀
  faSkullCrossbones,  // 
  faFire,             // 🔥
  faShield,           // 🛡️
  faHandFist,         // ⚔️ (attack)
  faMoon,             // 💤 (sleep)
  faFaceDizzy,        // 😵
  faHeartCrack,       // 💚
  faCertificate,      // 💜 (blessed/charmed - certificate looks like a halo)
  faFaceGrinStars,    // charmed
  faCheck,            // checkmark
  faArrowsAlt,        // ↘ (resize)
  faCompressAlt,      // ↘ (alternate)
  faBan,              // ✖ (cancel)
  faUserGroup,        // 👥 (players)
  faBug,              // 🐛 (poisoned/sick alternative)
  faTimes,            // ✕ (times/x)
  faGripLines,        // ≡ (drag handle)
  faSignOutAlt,       // 🚪 (leave session)
  faUpload,           // 📤 (upload)
  faGripLinesVertical, // ⫽ (vertical resize)
  faChevronUp,        // △
  faChevronDown,      // ▽
  faChevronLeft,      // ◁
  faChevronRight,     // ▷
  faCompress,         // ⤢
  faExpand,           // ⤨
  faColumns,          // Kolonner
  faCube,             // Cube
  faBook,             // 📖 (D&D data)
  faScroll,           // 📜 (spells)
  faList,             // Liste
  faStar,             // ⭐ (feats)
  faDatabase,         // 💾 (data manager)
  faComment,          // 💬 (chat)
  faComments,         // 💬💬 (chats)
  faDownload,         // 📥 (download/import)
  faSearch,           // 🔍 (search/browse)
  faCopy,             // 📋 (duplicate)
  faFile,             // 📄 (file/generic)
  faExternalLinkAlt,  // ↗ (open/external)
  faToggleOn,         // 🔛 (toggle on)
  faToggleOff,        // 🔛 (toggle off)
  faArrowLeft,        // ← (back)
  faFolder,           // 📁 (folder)
  faFolderOpen,
  faDumbbell,
  faFolderPlus,       // 📁+ (create folder)
  faBolt,             // ⚡ (paralyzed)
  faBed,              // 🛏️ (bed)
  faDisease,         // 🦠 (diseased)
  faLink,             // 🔗 (link/join)
  faUser,             // 👤 (user profile)
  faCrown,            // 👑 (GM crown)
  faInfoCircle,       // ℹ️ (info)
  faLightbulb,        // 💡 (lights)
  faMap,              // 🗺️ (map/scenes)
  faSun,
  faBookOpen,         // ☀️ (lights/sun)
  faMusic,            // 🎵 (audio)
  faVolumeUp,         // 🔊 (volume)
  faVolumeMute,       // 🔇 (mute)
  faPause,            // ⏸️ (pause)
  faPlay,             // ▶️ (play)
  faStop,              // ⏹️ (stop)
  faLock,             // 🔒 (locked)
  faUnlock,           // 🔓 (unlocked)
  faWind,             // 💨 (wind)
  faTree,             // 🌳 (tree/forest)
  faBeer,             // 🍺 (tavern)
  faMountain,
  faDiceFour,
  faFilter,
  faDiceSix,         // ⛰️ (mountain/cave)
  faRandom,           // 🔀 (shuffle)
  faRepeat,           // 🔁 (repeat)
  faPlusCircle,       // ➕ (add track)
  faSave,             // 💾 (save)
  // Missing icons
  faRotateRight,      // 🔄 (redo)
  faRotate,           // rotate
  faGem,              // 💎 (gem)
  faUsers,            // 👥 (users)
  faGlobe,            // 🌐 (globe)
  faLocationDot,      // 📍 (map-marker-alt)
  faFileLines,
  faInfo,
  faDice,        // 📄 (file-alt)
  faWandMagicSparkles, // ✨ (enchantment/aura)
  faDroplet,          // 💧 (droplet)
  faFeather,          // 🪶 (feather)
  faFlask,            // ⚗️ (flask)
  faCircleRadiation,  // ☢️ (radiation)
  faTemperatureHigh,  // 🌡️ (temperature high)
  faTemperatureLow,   // 🥶 (temperature low)
  faCloudBolt,        // ⛈️ (cloud bolt)
  faHandHoldingDroplet, // 💧 (hand holding droplet)
  faVial,             // 🧪 (vial)
  faSpider,            // 🕷️ (spider)
  faPaw,              // 🐾 (paw)
  faArrowUp,          // ⬆️ (arrow up)
  faDragon,            // 🐉 (dragon)
  faMask,             // 🎭 (mask)
  faFingerprint,       // 👆 (fingerprint)
  faKey,              // 🔑 (key)
  faDoorOpen,         // 🚪 (door open)
  faCoins,             // 💰 (coins)
  faBrain,            // 🧠 (brain)
  faGhost,            // 👻 (ghost)
  faChain,           // ⛓️ (chains)
  faEarListen,        // 👂 (ear)
  faAnchor,           // ⚓ (anchor)
  faShoePrints,       // 👣 (shoe prints)
  faSpellCheck,       // ✨ (spell)
  faHatWizard,        // 🎩 (wizard hat)
  faRing,
  faGauge,
  faCode,
  faGaugeSimple,
  faDrawPolygon,
  faCircle,
  faSquare,
  faMinus,
  faVirus,
  faHeartPulse,
  faFaceTired,      // 😴 (exhaustion)
  faFaceSurprise,   // Frightened
} from '@fortawesome/free-solid-svg-icons';

type IconSize = FontAwesomeIconProps['size'];

interface IconProps {
  name: string;
  className?: string;
  style?: CSSProperties;
  title?: string;
  size?: IconSize;
}

const iconMap: Record<string, typeof faDiceD20> = {
  // Navigation & Actions
  'dice': faDiceD20,
  'dice-roll': faDice,
  'theater-masks': faTheaterMasks,
  'image': faImage,
  'cog': faCog,
  'gauge': faGaugeSimple,
  'draw-polygon': faDrawPolygon, 
  'hand-pointer': faHandPointer,
  'ruler': faRuler,
  'measure-ray': faRuler,
  'measure-line': faRuler,
  'measure-circle': faCircle,
  'measure-sphere': faCircle,
  'measure-rectangle': faSquare,
  'measure-cube': faSquare,
  'measure-cone': faBolt,
  'measure-cylinder': faCircle,
  'cloud': faCloud,
  'cloud-rain': faCloudRain,
  'snowflake': faSnowflake,
  'smog': faSmog,
  'map-marker': faMapMarker,
  'layer-group': faLayerGroup,
  'tag': faTag,
  'smile': faSmile,
  'times-circle': faTimesCircle,
  'eye': faEye,
  'code': faCode,
  'cube': faCube,
  'filter': faFilter,
  'pen': faPen,
  'edit': faPen,
  'heart': faHeart,
  'tint': faTint,
  'plus': faPlus,
  'minus': faMinus,
  'trash': faTrash,
  'border-all': faBorderAll,
  'palette': faPalette,
  'border-none': faBorderNone,
  'user-secret': faUserSecret,
  'skull': faSkull,
  'skull-crossbones': faSkullCrossbones,
  'fire': faFire,
  'shield': faShield,
  'hand-fist': faHandFist,
  'moon': faMoon,
  'face-dizzy': faFaceDizzy,
  'face-suprised': faFaceSurprise,
  'face-stars': faFaceGrinStars,
  'heart-crack': faHeartCrack,
  'certificate': faCertificate,
  'check': faCheck,
  'arrows-alt': faArrowsAlt,
  'compress-alt': faCompressAlt,
  'ban': faBan,
  'user-group': faUserGroup,
  'bug': faBug,
  'times': faTimes,
  'grip-lines': faGripLines,
  'dice-d20': faDiceD20,
  'sign-out-alt': faSignOutAlt,
  'upload': faUpload,
  'grip-lines-vertical': faGripLinesVertical,
  'chevron-up': faChevronUp,
  'chevron-down': faChevronDown,
  'chevron-left': faChevronLeft,
  'chevron-right': faChevronRight,
  'compress': faCompress,
  'expand': faExpand,
  'columns': faColumns,
  'list': faList,
  'book': faBook,
  'book-open': faBookOpen,
  'scroll': faScroll,
  'star': faStar,
  'database': faDatabase,
  'comment': faComment,
  'comments': faComments,
  'download': faDownload,
  'search': faSearch,
  'copy': faCopy,
  'file': faFile,
  'info': faInfo,
  'external-link-alt': faExternalLinkAlt,
  'toggle-on': faToggleOn,
  'toggle-off': faToggleOff,
  'arrow-left': faArrowLeft,
  'folder': faFolder,
  'folder-open' : faFolderOpen,
  'dumbell' : faDumbbell,
  'folder-plus': faFolderPlus,
  'tired': faFaceTired,       // 😴 exhaustion
  'bolt': faBolt,        // ⚡ paralyzed
  'bed': faBed,          // 🛏️ unconscious
  'virus': faVirus,      // 🦠 virus
  'diseased': faDisease,  // diseased
  'link': faLink,        // 🔗 join
  'user': faUser,        // 👤 user profile
  'crown': faCrown,      // 👑 GM crown
  'info-circle': faInfoCircle, // ℹ️ info
  'lightbulb': faLightbulb, // 💡 lights
  'map': faMap,       // 🗺️ map/scenes
  'sun': faSun,       // ☀️ sun/lights
  // Audio
  'music': faMusic,          // 🎵 audio
  'volume-up': faVolumeUp,   // 🔊 volume
  'volume-off': faVolumeMute, // 🔇 mute
  'pause': faPause,          // ⏸️ pause
  'play': faPlay,            // ▶️ play
  'stop': faStop,            // ⏹️ stop
  'lock': faLock,            // 🔒 locked
  'unlock': faUnlock,        // 🔓 unlocked
  // Ambient
  'wind': faWind,            // 💨 wind
  'tree': faTree,            // 🌳 tree/forest
  'beer': faBeer,            // 🍺 tavern
  'mountain': faMountain,    // ⛰️ mountain/cave
  'shuffle': faRandom,      // 🔀 shuffle
  'repeat': faRepeat,       // 🔁 repeat
  'save': faSave,           // 💾 save
  'plus-circle': faPlusCircle, // ➕ add
  // Missing icons
  'redo': faRotateRight,    // 🔄 redo
  'rotate': faRotate,       // 🔄 rotate
  'gem': faGem,             // 💎 gem
  'users': faUsers,         // 👥 users
  'globe': faGlobe,         // 🌐 globe
  'map-marker-alt': faLocationDot, // 📍 map-marker-alt
  'file-alt': faFileLines, // 📄 file-alt
  // Enchantment/Magic Icons
  'wand-magic-sparkles': faWandMagicSparkles, // ✨ enchantment
  'droplet': faDroplet, // 💧 droplet
  'feather': faFeather, // 🪶 feather
  'flask': faFlask, // ⚗️ flask
  'circle-radiation': faCircleRadiation, // ☢️ radiation
  'temperature-high': faTemperatureHigh, // 🌡️ temperature high
  'temperature-low': faTemperatureLow, // 🥶 temperature low
  'cloud-bolt': faCloudBolt, // ⛈️ cloud bolt
  'hand-holding-droplet': faHandHoldingDroplet, // 💧 hand holding droplet
  'vial': faVial, // 🧪 vial
  'spider': faSpider, // 🕷️ spider
  'paw': faPaw, // 🐾 paw
  'arrow-up': faArrowUp, // ⬆️ arrow up
  'dragon': faDragon, // 🐉 dragon
  'mask': faMask, // 🎭 mask
  'fingerprint': faFingerprint, // 👆 fingerprint
  'key': faKey, // 🔑 key
  'door-open': faDoorOpen, // 🚪 door open
  'coins': faCoins, // 💰 coins
  'brain': faBrain, // 🧠 brain
  'ghost': faGhost, // 👻 ghost
  'chains': faChain, // ⛓️ chains
  'ear-lobes': faEarListen, // 👂 ear
  'anchor': faAnchor, // ⚓ anchor
  'shoe-prints': faShoePrints, // 👣 shoe prints
  'spell': faSpellCheck, // ✨ spell
  'hat-wizard': faHatWizard, // 🎩 wizard hat
  'ring': faRing, // 💍 ring
};

export function Icon({ name, className, style, title, size }: IconProps) {
  const icon = iconMap[name];
  if (!icon) {
    console.warn(`Icon "${name}" not found`);
    return null;
  }
  return <FontAwesomeIcon icon={icon} className={className} style={style as CSSProperties & Record<string, string>} title={title} size={size} />;
}

// Helper function to get icon name by emoji
export function getIconByEmoji(emoji: string): string {
  const emojiToIcon: Record<string, string> = {
    '🎲': 'dice',
    '🎭': 'theater-masks',
    '🖼️': 'image',
    '⚙️': 'cog',
    '✋': 'hand-pointer',
    '📏': 'ruler',
    '📐': 'ruler',
    '🌫️': 'cloud',
    '📍': 'map-marker',
    '📋': 'layer-group',
    '🏷️': 'tag',
    '😀': 'smile',
    '🚫': 'times-circle',
    '👁️': 'eye',
    '✏️': 'pen',
    '❤️': 'heart',
    '💙': 'tint',
    '💚': 'heart-crack',
    '💜': 'certificate',
    '➕': 'plus',
    '🗑️': 'trash',
    '🧱': 'border-all',
    '🏞️': 'palette',
    '🌐': 'border-none',
    '✨': 'user-secret',
    '💀': 'skull',
    '🔥': 'fire',
    '🛡️': 'shield',
    '⚔️': 'hand-fist',
    '💤': 'moon',
    '🤢': 'bug',
    '😵': 'face-dizzy',
  };
  return emojiToIcon[emoji] || '';
}
