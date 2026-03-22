// Simple Web Audio API based sound effects player
// Generates procedural sounds without requiring audio files

// Singleton to hold the UI bus reference
let uiBusGain: GainNode | null = null;
let audioContextInstance: AudioContext | null = null;

class AudioPlayer {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private volume: number = 0.5;
  private soundsEnabled: boolean = true;

  constructor() {
    // Lazy initialize on first user interaction
    this.initContext();
  }

  private initContext() {
    if (this.context) return;
    
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.context = new AudioContextClass();
      audioContextInstance = this.context;
      
      // Create master gain
      this.masterGain = this.context.createGain();
      this.masterGain.connect(this.context.destination);
      this.masterGain.gain.value = this.volume;
      
      // Create UI bus gain (connects to master)
      uiBusGain = this.context.createGain();
      uiBusGain.connect(this.masterGain);
      uiBusGain.gain.value = 1.0;
    } catch (e) {
      console.warn('Web Audio API not supported:', e);
    }
  }

  // Set UI bus gain for channel volume control
  setUiBusGain(gain: GainNode | null) {
    uiBusGain = gain;
  }

  // Get the appropriate gain node (uiBus if available, otherwise master)
  private getGainNode(): GainNode | null {
    if (uiBusGain) {
      return uiBusGain;
    }
    return this.masterGain;
  }

  // Connect to gain node with null check
  private connectToGain(osc: OscillatorNode, gain: GainNode) {
    const targetGain = this.getGainNode();
    if (targetGain) {
      gain.connect(targetGain);
    } else if (this.masterGain) {
      gain.connect(this.masterGain);
    }
  }

  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.masterGain) {
      this.masterGain.gain.value = this.volume;
    }
  }

  setEnabled(enabled: boolean) {
    this.soundsEnabled = enabled;
  }

  // Resume audio context if suspended (browser autoplay policy)
  async resume() {
    if (this.context?.state === 'suspended') {
      await this.context.resume();
    }
  }

  // Available D20 roll sound files - use MP3 for Safari compatibility
  private d20RollSounds = [
    '/assets/audio/sfx/d20-rolls/d20-rolls-001.mp3',
    '/assets/audio/sfx/d20-rolls/d20-rolls-002.mp3',
    '/assets/audio/sfx/d20-rolls/d20-rolls-003.mp3',
    '/assets/audio/sfx/d20-rolls/d20-rolls-004.mp3',
    '/assets/audio/sfx/d20-rolls/d20-rolls.mp3',
  ];

  // Play a dice roll sound - plays a random audio file from d20-rolls directory
  playDiceRoll() {
    if (!this.soundsEnabled) return;
    this.resume();

    // Pick a random sound file
    const randomIndex = Math.floor(Math.random() * this.d20RollSounds.length);
    const soundPath = this.d20RollSounds[randomIndex];

    // Use HTMLAudioElement for more reliable loading
    const audio = new Audio();
    audio.volume = this.volume;
    
    audio.src = soundPath;
    
    // Add debugging: log when audio starts loading and any errors
    audio.addEventListener('loadstart', () => {
      console.log('D20 roll sound: Loading started for', soundPath);
    });
    
    audio.addEventListener('error', (e) => {
      console.warn('D20 roll sound: Load error -', e); 
      console.warn('D20 roll sound: Audio error code:', audio.error?.code);
      console.warn('D20 roll sound: Audio error message:', audio.error?.message);
    });
    
    audio.play().catch(err => {
      console.warn('Error playing d20 roll sound:', err);
      console.warn('Error name:', err.name);
      console.warn('Error message:', err.message);
    });
  }

  // Play a success sound (pleasant chime)
  playSuccess() {
    if (!this.soundsEnabled || !this.context) return;
    this.resume();

    const now = this.context.currentTime;
    const frequencies = [523.25, 659.25, 783.99]; // C5, E5, G5 (C major chord)
    const targetGain = this.getGainNode();
    
    frequencies.forEach((freq, i) => {
      const osc = this.context!.createOscillator();
      const gain = this.context!.createGain();
      
      osc.connect(gain);
      if (targetGain) {
        gain.connect(targetGain);
      } else if (this.masterGain) {
        gain.connect(this.masterGain);
      }
      
      osc.frequency.value = freq;
      osc.type = 'sine';
      
      const startTime = now + i * 0.1;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.2, startTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.5);
      
      osc.start(startTime);
      osc.stop(startTime + 0.5);
    });
  }

  // Play a natural 20 sound (celebratory)
  playNatural20() {
    if (!this.soundsEnabled || !this.context) return;
    this.resume();

    const now = this.context.currentTime;
    
    // More elaborate celebration sound
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5]; // C5, E5, G5, C6, E6
    const targetGain = this.getGainNode();
    
    notes.forEach((freq, i) => {
      const osc = this.context!.createOscillator();
      const gain = this.context!.createGain();
      
      osc.connect(gain);
      if (targetGain) {
        gain.connect(targetGain);
      } else if (this.masterGain) {
        gain.connect(this.masterGain);
      }
      
      osc.frequency.value = freq;
      osc.type = 'sine';
      
      const startTime = now + i * 0.08;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.25, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.6);
      
      osc.start(startTime);
      osc.stop(startTime + 0.6);
    });
  }

  // Play a natural 1 sound (failure)
  playNatural1() {
    if (!this.soundsEnabled || !this.context) return;
    this.resume();

    const now = this.context.currentTime;
    const targetGain = this.getGainNode();
    
    // Descending sad sound
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    
    osc.connect(gain);
    if (targetGain) {
      gain.connect(targetGain);
    } else if (this.masterGain) {
      gain.connect(this.masterGain);
    }
    
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.5);
    osc.type = 'sawtooth';
    
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    
    osc.start(now);
    osc.stop(now + 0.5);
  }

  // Play a UI click sound
  playClick() {
    if (!this.soundsEnabled || !this.context) return;
    this.resume();

    const now = this.context.currentTime;
    const targetGain = this.getGainNode();
    
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    
    osc.connect(gain);
    if (targetGain) {
      gain.connect(targetGain);
    } else if (this.masterGain) {
      gain.connect(this.masterGain);
    }
    
    osc.frequency.value = 800;
    osc.type = 'square';
    
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    
    osc.start(now);
    osc.stop(now + 0.03);
  }

  // Play a token placement sound
  playTokenPlace() {
    if (!this.soundsEnabled || !this.context) return;
    this.resume();

    const now = this.context.currentTime;
    const targetGain = this.getGainNode();
    
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    
    osc.connect(gain);
    if (targetGain) {
      gain.connect(targetGain);
    } else if (this.masterGain) {
      gain.connect(this.masterGain);
    }
    
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.1);
    osc.type = 'sine';
    
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    
    osc.start(now);
    osc.stop(now + 0.15);
  }

  // Play combat start sound
  playCombatStart() {
    if (!this.soundsEnabled) return;
    
    this.initContext();
    if (!this.context) {
      console.warn('Audio context not available');
      return;
    }
    
    this.resume();

    const now = this.context.currentTime;
    const targetGain = this.getGainNode();
    
    // More dramatic drum-like stinger sound
    // Three loud drum hits
    for (let i = 0; i < 3; i++) {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();
      
      osc.connect(gain);
      if (targetGain) {
        gain.connect(targetGain);
      } else if (this.masterGain) {
        gain.connect(this.masterGain);
      }
      
      // Lower frequency for deeper drum sound
      osc.frequency.value = 80 - i * 15;
      osc.type = 'square';
      
      // Start time with slight delay between hits
      const startTime = now + i * 0.25;
      
      // Louder gain for more prominent sound
      gain.gain.setValueAtTime(0.4, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);
      
      osc.start(startTime);
      osc.stop(startTime + 0.4);
    }
    
    // Add a rising tone to build tension
    const tensionOsc = this.context.createOscillator();
    const tensionGain = this.context.createGain();
    tensionOsc.connect(tensionGain);
    if (targetGain) {
      tensionGain.connect(targetGain);
    } else if (this.masterGain) {
      tensionGain.connect(this.masterGain);
    }
    tensionOsc.frequency.setValueAtTime(200, now);
    tensionOsc.frequency.exponentialRampToValueAtTime(400, now + 0.6);
    tensionOsc.type = 'sawtooth';
    tensionGain.gain.setValueAtTime(0.15, now);
    tensionGain.gain.linearRampToValueAtTime(0, now + 0.6);
    tensionOsc.start(now);
    tensionOsc.stop(now + 0.6);
  }

  // Play a notification sound
  playNotification() {
    if (!this.soundsEnabled || !this.context) return;
    this.resume();

    const now = this.context.currentTime;
    const targetGain = this.getGainNode();
    
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    
    osc.connect(gain);
    if (targetGain) {
      gain.connect(targetGain);
    } else if (this.masterGain) {
      gain.connect(this.masterGain);
    }
    
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.setValueAtTime(800, now + 0.1);
    osc.type = 'sine';
    
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    
    osc.start(now);
    osc.stop(now + 0.3);
  }
}

// Singleton instance
export const audioPlayer = new AudioPlayer();
