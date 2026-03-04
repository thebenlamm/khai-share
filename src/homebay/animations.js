'use strict';

/**
 * HomeBay-specific animation capture helpers.
 *
 * Extends the generic animation capture agent with HomeBay-specific patterns:
 * - Skeleton loader transitions (.animate-pulse)
 * - Countdown timer animations
 * - Modal/dialog transitions
 *
 * These helpers know about HomeBay's UI patterns and provide high-level
 * functions for capturing specific transition states that are relevant to
 * testing HomeBay's UX.
 *
 * Relationship to waitForHydration (from navigate.js):
 * - waitForHydration: waits for skeleton to disappear, then continues execution
 * - captureSkeletonTransition: captures 3 states during the transition (visible → fading → hydrated)
 *
 * Usage:
 *   const captures = await captureSkeletonTransition(page, './screenshots/skeleton');
 *   // Returns: ['skeleton-visible', 'skeleton-fading', 'content-hydrated']
 */

const { waitForAnimations, getAnimationInfo } = require('../agent/animationCapture');
const path = require('path');

/**
 * Capture HomeBay's skeleton loader transition in 3 states.
 *
 * HomeBay shows .animate-pulse skeleton elements while the auth store hydrates
 * from localStorage. This function captures:
 * 1. skeleton-visible: Initial state with skeleton animation running
 * 2. skeleton-fading: Mid-transition when skeleton is fading out (opacity < 1)
 * 3. content-hydrated: Final state after skeleton disappears and content is visible
 *
 * Note: This function modifies page state (waits for specific timing). Use on
 * throwaway page instances or at the end of a test flow.
 *
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {string} outputDir - Directory to save screenshots (will be created if missing)
 * @returns {Promise<Array<string>>} Array of captured state names: ['skeleton-visible', 'skeleton-fading', 'content-hydrated']
 *
 * @example
 *   await navigateTo(page, 'https://staging.homebay.com/dashboard');
 *   const states = await captureSkeletonTransition(page, './screenshots/skeleton');
 *   // Screenshots saved:
 *   //   ./screenshots/skeleton/skeleton-visible.png
 *   //   ./screenshots/skeleton/skeleton-fading.png
 *   //   ./screenshots/skeleton/content-hydrated.png
 */
async function captureSkeletonTransition(page, outputDir) {
  const fs = require('fs');
  fs.mkdirSync(outputDir, { recursive: true });

  const capturedStates = [];

  try {
    // State 1: Skeleton visible (animation running)
    const skeletonVisible = await page.waitForSelector('.animate-pulse', {
      timeout: 5000,
    }).catch(() => null);

    if (skeletonVisible) {
      await page.screenshot({
        path: path.join(outputDir, 'skeleton-visible.png'),
      });
      capturedStates.push('skeleton-visible');
      console.log('[HomeBayAnimations] Captured skeleton-visible state');

      // State 2: Skeleton fading (opacity < 1)
      // Wait for the skeleton to start fading out
      await page.waitForFunction(
        () => {
          const skeleton = document.querySelector('.animate-pulse');
          if (!skeleton) return true; // Already gone
          const opacity = parseFloat(window.getComputedStyle(skeleton).opacity);
          return opacity < 1;
        },
        { timeout: 10000 }
      ).catch(() => null);

      // Small delay to catch mid-fade
      await page.waitForTimeout(50);

      // Check if skeleton is still present (might have already disappeared)
      const skeletonStillPresent = await page.evaluate(() => {
        return document.querySelector('.animate-pulse') !== null;
      });

      if (skeletonStillPresent) {
        await page.screenshot({
          path: path.join(outputDir, 'skeleton-fading.png'),
        });
        capturedStates.push('skeleton-fading');
        console.log('[HomeBayAnimations] Captured skeleton-fading state');
      } else {
        console.log('[HomeBayAnimations] Skeleton disappeared too fast, skipped skeleton-fading');
      }
    } else {
      console.log('[HomeBayAnimations] No skeleton detected on page');
    }

    // State 3: Content hydrated (skeleton gone)
    await page.waitForFunction(
      () => !document.querySelector('.animate-pulse'),
      { timeout: 10000 }
    ).catch(() => null);

    await page.screenshot({
      path: path.join(outputDir, 'content-hydrated.png'),
    });
    capturedStates.push('content-hydrated');
    console.log('[HomeBayAnimations] Captured content-hydrated state');
  } catch (err) {
    console.log(`[HomeBayAnimations] Error capturing skeleton transition: ${err.message}`);
  }

  return capturedStates;
}

/**
 * Get information about active HomeBay animations.
 *
 * Checks for common HomeBay UI animations:
 * - Skeleton loaders (.animate-pulse)
 * - Countdown timers ([data-testid="countdown"])
 * - Modal transitions (.modal, .dialog)
 *
 * Returns structured information about which animations are currently running.
 * Useful for debugging why a screenshot looks unexpected or understanding
 * animation timing issues during test development.
 *
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @returns {Promise<{skeleton: Array, countdown: Array, modal: Array}>} Animation info grouped by type
 *
 * @example
 *   const animations = await getHomeBayAnimations(page);
 *   console.log(animations);
 *   // {
 *   //   skeleton: [
 *   //     { type: 'CSSAnimation', name: 'pulse', duration: 2000, progress: 45, playState: 'running' }
 *   //   ],
 *   //   countdown: [],
 *   //   modal: [
 *   //     { type: 'CSSTransition', name: 'opacity', duration: 300, progress: 20, playState: 'running' }
 *   //   ]
 *   // }
 */
async function getHomeBayAnimations(page) {
  try {
    // Check for skeleton animations
    const skeleton = await getAnimationInfo(page, '.animate-pulse').catch(() => []);

    // Check for countdown timer animations
    const countdown = await getAnimationInfo(page, '[data-testid="countdown"]').catch(() => []);

    // Check for modal/dialog animations
    let modal = [];
    const modalSelectors = ['.modal', '.dialog', '[role="dialog"]'];
    for (const selector of modalSelectors) {
      const hasElement = await page.evaluate((sel) => {
        return document.querySelector(sel) !== null;
      }, selector);

      if (hasElement) {
        const info = await getAnimationInfo(page, selector).catch(() => []);
        modal = modal.concat(info);
      }
    }

    return {
      skeleton,
      countdown,
      modal,
    };
  } catch (err) {
    console.log(`[HomeBayAnimations] Error getting animation info: ${err.message}`);
    return {
      skeleton: [],
      countdown: [],
      modal: [],
    };
  }
}

module.exports = {
  captureSkeletonTransition,
  getHomeBayAnimations,
};
