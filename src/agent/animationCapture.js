'use strict';

/**
 * AnimationCapture - Animation-aware screenshot capture for Khai.
 *
 * Uses the browser-native Web Animations API to detect, control, and capture
 * UI states during CSS animations and transitions. Solves the non-deterministic
 * screenshot problem where animations cause inconsistent visual states.
 *
 * Key benefits of Web Animations API over CSS-only detection:
 * - Unified interface for both CSS animations and transitions
 * - Access to animation.finished Promise for reliable waiting
 * - Ability to pause, seek, and scrub animations programmatically
 * - Works with Shadow DOM elements
 *
 * MDN Reference: https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API
 *
 * Usage patterns:
 *   // Wait for all animations to complete before screenshot
 *   await waitForAnimations(page);
 *   await page.screenshot({ path: 'stable.png' });
 *
 *   // Capture specific animation states
 *   await captureAnimationStates(page, '.modal', [0, 50, 100], './screenshots');
 *
 *   // Pause all animations for stable hover state screenshots
 *   await pauseAllAnimations(page);
 *   await page.screenshot({ path: 'tooltip.png' });
 */

/**
 * Wait for all running animations on a page (or within a selector) to complete.
 *
 * Useful for taking deterministic screenshots after page load or user action.
 * Without this, screenshots captured during animations are non-deterministic
 * because the animation progress varies by millisecond timing.
 *
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {string} [selector='body'] - CSS selector to scope animation search (default: entire page)
 * @param {number} [timeout=10000] - Max wait time in milliseconds
 * @returns {Promise<number>} Number of animations that completed
 *
 * @example
 *   await navigateTo(page, '/dashboard');
 *   await waitForAnimations(page); // Wait for page transition animations
 *   await page.screenshot({ path: 'dashboard-stable.png' });
 */
async function waitForAnimations(page, selector = 'body', timeout = 10000) {
  try {
    const count = await page.evaluate(async (sel, ms) => {
      const root = document.querySelector(sel);
      if (!root) return 0;

      // Get all animations within the selector (includes Shadow DOM)
      const animations = document.getAnimations({ subtree: true })
        .filter(anim => {
          // Filter to running animations only
          if (anim.playState !== 'running') return false;

          // Check if animation's target is within our selector scope
          if (anim.effect && anim.effect.target) {
            return root.contains(anim.effect.target);
          }

          return false;
        });

      if (animations.length === 0) return 0;

      // Wait for all running animations to finish
      // Use Promise.race with timeout to handle cancelled/infinite animations
      const animPromises = animations.map(anim => anim.finished.catch(() => null));
      const timeoutPromise = new Promise(resolve => setTimeout(() => resolve('timeout'), ms));

      await Promise.race([
        Promise.all(animPromises),
        timeoutPromise,
      ]);

      return animations.length;
    }, selector, timeout);

    if (count > 0) {
      console.log(`[AnimationCapture] Waited for ${count} animation(s) to complete`);
    }

    return count;
  } catch (err) {
    // Older browsers or pages without Web Animations API support
    console.log(`[AnimationCapture] Web Animations API not available: ${err.message}`);
    return 0;
  }
}

/**
 * Capture screenshots at specific animation progress points.
 *
 * Programmatically seeks animations to exact progress points and captures
 * screenshots. Useful for testing skeleton loaders, progress indicators,
 * countdown timers, and other time-based UI transitions.
 *
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {string} selector - CSS selector for the animated element
 * @param {Array<number|string>} states - Progress points to capture: numbers (0-100 percent) or strings ('start', 'mid', 'end')
 * @param {string} outputDir - Directory to save screenshots
 * @returns {Promise<Array<{state: string, screenshot: string, timestamp: number}>>} Captured states with file paths
 *
 * @example
 *   // Capture skeleton loader transition at 3 points
 *   const captures = await captureAnimationStates(
 *     page,
 *     '.skeleton-loader',
 *     ['start', 'mid', 'end'],
 *     './screenshots/skeleton'
 *   );
 *   // Returns: [
 *   //   { state: 'start', screenshot: './screenshots/skeleton/skeleton-loader-start.png', timestamp: 1234567890 },
 *   //   { state: 'mid', screenshot: './screenshots/skeleton/skeleton-loader-mid.png', timestamp: 1234567900 },
 *   //   { state: 'end', screenshot: './screenshots/skeleton/skeleton-loader-end.png', timestamp: 1234567910 }
 *   // ]
 */
async function captureAnimationStates(page, selector, states, outputDir) {
  const fs = require('fs');
  const path = require('path');

  fs.mkdirSync(outputDir, { recursive: true });

  const captures = [];

  for (const state of states) {
    // Normalize state to percentage (0-100)
    let percent;
    if (typeof state === 'string') {
      if (state === 'start') percent = 0;
      else if (state === 'mid') percent = 50;
      else if (state === 'end') percent = 100;
      else percent = parseInt(state, 10);
    } else {
      percent = state;
    }

    if (isNaN(percent) || percent < 0 || percent > 100) {
      console.log(`[AnimationCapture] Invalid state: ${state}, skipping`);
      continue;
    }

    // Seek animation to exact progress point
    try {
      await page.evaluate((sel, pct) => {
        const elem = document.querySelector(sel);
        if (!elem) throw new Error(`Element not found: ${sel}`);

        // Find animations targeting this element
        const animations = document.getAnimations({ subtree: true })
          .filter(anim => anim.effect && anim.effect.target === elem);

        if (animations.length === 0) {
          throw new Error(`No animations found for ${sel}`);
        }

        // Pause all animations and seek to desired progress
        for (const anim of animations) {
          anim.pause();

          // Calculate currentTime based on animation duration
          if (anim.effect && anim.effect.getTiming) {
            const duration = anim.effect.getTiming().duration;
            if (typeof duration === 'number') {
              anim.currentTime = (duration * pct) / 100;
            }
          }
        }
      }, selector, percent);

      // Wait a tick for the browser to render the paused state
      await page.waitForTimeout(50);

      // Capture screenshot
      const stateName = typeof state === 'string' ? state : `${percent}pct`;
      const fileName = `${selector.replace(/[^a-zA-Z0-9]/g, '-')}-${stateName}.png`;
      const filePath = path.join(outputDir, fileName);

      await page.screenshot({ path: filePath });

      captures.push({
        state: stateName,
        screenshot: filePath,
        timestamp: Date.now(),
      });

      console.log(`[AnimationCapture] Captured ${selector} at ${stateName}: ${filePath}`);
    } catch (err) {
      console.log(`[AnimationCapture] Failed to capture ${selector} at ${state}: ${err.message}`);
    }
  }

  return captures;
}

/**
 * Pause all animations and transitions on the page.
 *
 * Useful for capturing stable screenshots of transient UI states like
 * hover effects, tooltips, modals, and dropdowns. Without pausing,
 * these states may animate during screenshot capture.
 *
 * Note: This injects CSS rules and pauses Web Animations API animations.
 * Page state is modified — use on throwaway page instances.
 *
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @returns {Promise<number>} Number of animations paused
 *
 * @example
 *   await page.hover('.tooltip-trigger');
 *   await pauseAllAnimations(page);
 *   await page.screenshot({ path: 'tooltip-stable.png' });
 */
async function pauseAllAnimations(page) {
  try {
    const count = await page.evaluate(() => {
      // Inject CSS to stop all animations and transitions
      const style = document.createElement('style');
      style.textContent = `
        *, *::before, *::after {
          animation-play-state: paused !important;
          animation-delay: 0s !important;
          animation-duration: 0s !important;
          transition: none !important;
        }
      `;
      document.head.appendChild(style);

      // Pause all Web Animations API animations
      const animations = document.getAnimations({ subtree: true });
      for (const anim of animations) {
        anim.pause();
      }

      return animations.length;
    });

    console.log(`[AnimationCapture] Paused ${count} animation(s)`);
    return count;
  } catch (err) {
    console.log(`[AnimationCapture] Failed to pause animations: ${err.message}`);
    return 0;
  }
}

/**
 * Get detailed information about animations on an element.
 *
 * Returns animation metadata including type (CSSAnimation vs CSSTransition),
 * duration, current progress, and playback state. Useful for debugging
 * animation timing issues and understanding which animations are active.
 *
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {string} selector - CSS selector for the element to inspect
 * @returns {Promise<Array<{type: string, name: string, duration: number, currentTime: number, progress: number, playState: string}>>}
 *
 * @example
 *   const info = await getAnimationInfo(page, '.skeleton-loader');
 *   console.log(info);
 *   // [
 *   //   {
 *   //     type: 'CSSAnimation',
 *   //     name: 'pulse',
 *   //     duration: 2000,
 *   //     currentTime: 1000,
 *   //     progress: 50,
 *   //     playState: 'running'
 *   //   }
 *   // ]
 */
async function getAnimationInfo(page, selector) {
  try {
    return await page.evaluate((sel) => {
      const elem = document.querySelector(sel);
      if (!elem) return [];

      const animations = document.getAnimations({ subtree: true })
        .filter(anim => anim.effect && anim.effect.target === elem);

      return animations.map(anim => {
        const timing = anim.effect?.getTiming() || {};
        const duration = typeof timing.duration === 'number' ? timing.duration : 0;
        const currentTime = anim.currentTime || 0;
        const progress = duration > 0 ? Math.round((currentTime / duration) * 100) : 0;

        return {
          type: anim.constructor.name, // 'CSSAnimation' or 'CSSTransition'
          name: anim.animationName || anim.transitionProperty || 'unknown',
          duration,
          currentTime,
          progress,
          playState: anim.playState,
        };
      });
    }, selector);
  } catch (err) {
    console.log(`[AnimationCapture] Failed to get animation info: ${err.message}`);
    return [];
  }
}

module.exports = {
  waitForAnimations,
  captureAnimationStates,
  pauseAllAnimations,
  getAnimationInfo,
};
