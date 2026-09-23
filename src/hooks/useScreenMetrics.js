import { useState, useEffect } from 'react';

export const DEVICE_PRESETS = [
  { id: 'real', name: 'Real Device (Auto)', width: null, height: null, category: 'Native' },
  { id: 'compact', name: 'Ultra Compact (iPhone SE 1)', width: 320, height: 568, category: 'Compact Phone' },
  { id: 'flagship', name: 'Standard Flagship (iPhone 15/16)', width: 393, height: 852, category: 'Flagship' },
  { id: 'large-flagship', name: 'Max / Ultra (S24 Ultra / Max)', width: 430, height: 932, category: 'Large Phone' },
  { id: 'foldable-closed', name: 'Galaxy Fold (Closed Cover)', width: 344, height: 882, category: 'Foldable Cover' },
  { id: 'foldable-open', name: 'Galaxy Fold (Unfolded Tablet)', width: 768, height: 960, category: 'Foldable Open' },
  { id: 'tablet', name: 'iPad / Android Tablet', width: 820, height: 1180, category: 'Tablet' },
];

/**
 * Advanced Screen Measurement & Universal Device Fitting Hook
 * Measures live viewport, physical screen, safe area insets, virtual keyboard offset,
 * device pixel ratio, orientation, and screen classification.
 */
export function useScreenMetrics() {
  const [metrics, setMetrics] = useState(() => getScreenMetrics());
  const [simulationPreset, setSimulationPreset] = useState(null); // null = real device

  useEffect(() => {
    // Hidden probe element to measure computed env(safe-area-inset-*) accurately
    const probe = document.createElement('div');
    probe.id = 'nexus-safe-area-probe';
    probe.style.position = 'fixed';
    probe.style.top = '0';
    probe.style.left = '0';
    probe.style.width = '0';
    probe.style.height = '0';
    probe.style.paddingTop = 'env(safe-area-inset-top, 0px)';
    probe.style.paddingBottom = 'env(safe-area-inset-bottom, 0px)';
    probe.style.paddingLeft = 'env(safe-area-inset-left, 0px)';
    probe.style.paddingRight = 'env(safe-area-inset-right, 0px)';
    probe.style.pointerEvents = 'none';
    probe.style.visibility = 'hidden';
    probe.style.zIndex = '-9999';
    document.body.appendChild(probe);

    const updateMetrics = () => {
      const computedProbe = window.getComputedStyle(probe);
      const safeTop = parseFloat(computedProbe.paddingTop) || 0;
      const safeBottom = parseFloat(computedProbe.paddingBottom) || 0;
      const safeLeft = parseFloat(computedProbe.paddingLeft) || 0;
      const safeRight = parseFloat(computedProbe.paddingRight) || 0;

      const newMetrics = getScreenMetrics({
        safeTop,
        safeBottom,
        safeLeft,
        safeRight,
      });

      setMetrics(newMetrics);

      // Inject dynamic CSS variables into document root
      const root = document.documentElement;
      const visualHeight = newMetrics.visualViewportHeight;
      const visualWidth = newMetrics.visualViewportWidth;

      root.style.setProperty('--app-height', `${visualHeight}px`);
      root.style.setProperty('--app-width', `${visualWidth}px`);
      root.style.setProperty('--safe-top', `${safeTop}px`);
      root.style.setProperty('--safe-bottom', `${safeBottom}px`);
      root.style.setProperty('--safe-left', `${safeLeft}px`);
      root.style.setProperty('--safe-right', `${safeRight}px`);
      root.style.setProperty('--keyboard-offset', `${newMetrics.keyboardHeight}px`);

      // Update body classes for conditional styling
      document.body.classList.toggle('is-compact', newMetrics.isCompact);
      document.body.classList.toggle('is-mobile', newMetrics.isMobile);
      document.body.classList.toggle('is-tablet', newMetrics.isTablet);
      document.body.classList.toggle('is-desktop', newMetrics.isDesktop);
      document.body.classList.toggle('is-landscape', newMetrics.orientation === 'landscape');
      document.body.classList.toggle('is-portrait', newMetrics.orientation === 'portrait');
      document.body.classList.toggle('keyboard-active', newMetrics.isKeyboardOpen);
    };

    updateMetrics();

    // Event listeners
    window.addEventListener('resize', updateMetrics, { passive: true });
    window.addEventListener('orientationchange', updateMetrics, { passive: true });

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateMetrics, { passive: true });
      window.visualViewport.addEventListener('scroll', updateMetrics, { passive: true });
    }

    return () => {
      window.removeEventListener('resize', updateMetrics);
      window.removeEventListener('orientationchange', updateMetrics);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updateMetrics);
        window.visualViewport.removeEventListener('scroll', updateMetrics);
      }
      probe.remove();
    };
  }, []);

  return {
    ...metrics,
    simulationPreset,
    setSimulationPreset,
  };
}

function getScreenMetrics(insets = { safeTop: 0, safeBottom: 0, safeLeft: 0, safeRight: 0 }) {
  if (typeof window === 'undefined') {
    return {
      windowWidth: 390,
      windowHeight: 844,
      visualViewportWidth: 390,
      visualViewportHeight: 844,
      screenWidth: 390,
      screenHeight: 844,
      dpr: 2,
      orientation: 'portrait',
      aspectRatio: '9:19.5',
      aspectRatioNum: 0.46,
      category: 'standard-mobile',
      isCompact: false,
      isMobile: true,
      isTablet: false,
      isDesktop: false,
      isFoldable: false,
      isKeyboardOpen: false,
      keyboardHeight: 0,
      safeArea: { top: 0, bottom: 0, left: 0, right: 0 },
    };
  }

  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  const vv = window.visualViewport;
  const visualViewportWidth = vv ? Math.round(vv.width) : windowWidth;
  const visualViewportHeight = vv ? Math.round(vv.height) : windowHeight;

  const screenWidth = window.screen.width || windowWidth;
  const screenHeight = window.screen.height || windowHeight;
  const dpr = window.devicePixelRatio || 1;

  const orientation = windowWidth > windowHeight ? 'landscape' : 'portrait';
  const ratioNum = Number((windowWidth / windowHeight).toFixed(2));
  
  // Calculate aspect ratio string (e.g. 9:16, 9:19.5, 4:3, 16:9)
  let aspectRatio = `${windowWidth}:${windowHeight}`;
  if (ratioNum <= 0.5) aspectRatio = '9:19.5 (Tall Flagship)';
  else if (ratioNum <= 0.6) aspectRatio = '9:16 (Standard Phone)';
  else if (ratioNum <= 0.8) aspectRatio = '3:4 / Square (Foldable / Mini Tablet)';
  else if (ratioNum <= 1.2) aspectRatio = '1:1 (Square Foldable)';
  else if (ratioNum <= 1.6) aspectRatio = '4:3 (Tablet Landscape)';
  else aspectRatio = '16:9 / 21:9 (Wide)';

  // Virtual keyboard detection on mobile
  const heightDifference = windowHeight - visualViewportHeight;
  const isKeyboardOpen = heightDifference > 140; // Virtual keyboard is typically >= 150px
  const keyboardHeight = isKeyboardOpen ? heightDifference : 0;

  // Device Classification
  const isCompact = windowWidth < 360;
  const isStandardMobile = windowWidth >= 360 && windowWidth < 480;
  const isFoldable = (windowWidth >= 480 && windowWidth <= 768 && ratioNum >= 0.75 && ratioNum <= 1.25) || (ratioNum <= 0.45 && windowWidth <= 380);
  const isTablet = windowWidth >= 768 && windowWidth < 1024;
  const isDesktop = windowWidth >= 1024;
  const isMobile = windowWidth < 768;

  let category = 'standard-mobile';
  if (isCompact) category = 'compact-phone';
  else if (isFoldable) category = 'foldable-device';
  else if (isTablet) category = 'tablet';
  else if (isDesktop) category = 'desktop-monitor';

  return {
    windowWidth,
    windowHeight,
    visualViewportWidth,
    visualViewportHeight,
    screenWidth,
    screenHeight,
    dpr,
    orientation,
    aspectRatio,
    aspectRatioNum: ratioNum,
    category,
    isCompact,
    isMobile,
    isTablet,
    isDesktop,
    isFoldable,
    isKeyboardOpen,
    keyboardHeight,
    safeArea: {
      top: insets.safeTop,
      bottom: insets.safeBottom,
      left: insets.safeLeft,
      right: insets.safeRight,
    },
  };
}
