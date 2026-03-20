import PixiBackground from "./PixiBackground";
import { LoginPanel } from './LoginPanel';
import './LoginPage.css';

/**
 * LoginPage - Main container for the login screen
 * 
 * Architecture:
 * <LoginPage>
 *   <PixiBackground/>  (z-index: 0)
 *   <div className="login-bg"/>  (z-index: 0 - CSS background)
 *   <div className="vignette"/>  (z-index: 1)
 *   <LoginPanel/>  (z-index: 2)
 *   <footer className="login-footer"/>  (z-index: 3)
 * </LoginPage>
 */
export function LoginPage() {
  const handleSettingsClick = () => {
    // TODO: Implement settings modal
    console.log('Settings clicked');
  };

  return (
    <div className="login-page">
      {/* CSS Background (behind Pixi for fallback/additional effect) */}
      <div className="login-bg" />
      
      {/* PixiJS Animated Background */}
      <PixiBackground />
      
      {/* Vignette Overlay */}
      <div className="vignette" />
      
      {/* Login Panel UI */}
      <LoginPanel onSettingsClick={handleSettingsClick} />
      
      {/* Footer */}
      <footer className="login-footer">
        <span>Virtual Tabletop © 2024</span>
      </footer>
    </div>
  );
}

export default LoginPage;
