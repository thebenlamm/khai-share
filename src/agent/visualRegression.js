const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');

/**
 * VisualRegression - Pixel-level screenshot comparison for Khai.
 *
 * Compares baseline screenshots against current screenshots,
 * generates diff images highlighting changed pixels, and
 * produces a structured report.
 *
 * Usage:
 *   const vr = new VisualRegression({
 *     baselineDir: '/path/to/baseline',
 *     currentDir:  '/path/to/current',
 *     threshold:   0.1,  // 10% pixel diff tolerance
 *   });
 *   const report = await vr.compare();
 */
class VisualRegression {
  constructor(config = {}) {
    this.baselineDir = config.baselineDir || path.join(__dirname, '../../screenshots/baseline');
    this.currentDir = config.currentDir || path.join(__dirname, '../../screenshots/current');
    this.diffDir = config.diffDir || path.join(__dirname, '../../screenshots/diffs');
    this.threshold = config.threshold ?? 0.1; // pixelmatch threshold (0-1, lower = stricter)
  }

  /**
   * Compare all PNGs found in baseline and current directories.
   * Returns a report with match/change/missing/added counts and per-file diffs.
   */
  async compare() {
    fs.mkdirSync(this.diffDir, { recursive: true });

    const baselineFiles = this._listPNGs(this.baselineDir);
    const currentFiles = this._listPNGs(this.currentDir);

    const baselineSet = new Set(baselineFiles);
    const currentSet = new Set(currentFiles);

    const report = {
      totalCompared: 0,
      matched: 0,
      changed: 0,
      missing: [],   // in baseline but not in current
      added: [],     // in current but not in baseline
      diffs: [],
      timestamp: new Date().toISOString(),
    };

    // Files present in baseline but missing from current run
    for (const file of baselineFiles) {
      if (!currentSet.has(file)) {
        report.missing.push(file);
      }
    }

    // Files present in current but not in baseline (new pages)
    for (const file of currentFiles) {
      if (!baselineSet.has(file)) {
        report.added.push(file);
      }
    }

    // Compare files that exist in both directories
    const common = baselineFiles.filter(f => currentSet.has(f));
    report.totalCompared = common.length;

    for (const file of common) {
      const baselinePath = path.join(this.baselineDir, file);
      const currentPath = path.join(this.currentDir, file);
      const diffPath = path.join(this.diffDir, file);

      try {
        const result = await this.compareImages(baselinePath, currentPath, diffPath);

        if (result.diffPercent > 0) {
          report.changed++;
          report.diffs.push({
            name: file,
            diffPercent: result.diffPercent,
            diffPixels: result.diffPixels,
            totalPixels: result.totalPixels,
            diffPath,
          });
        } else {
          report.matched++;
          // Remove diff file if images are identical
          if (fs.existsSync(diffPath)) {
            fs.unlinkSync(diffPath);
          }
        }
      } catch (err) {
        report.diffs.push({
          name: file,
          error: err.message,
          diffPercent: null,
          diffPath: null,
        });
      }
    }

    // Sort diffs by percentage descending so biggest changes appear first
    report.diffs.sort((a, b) => (b.diffPercent || 0) - (a.diffPercent || 0));

    console.log(`[VisualRegression] Compared ${report.totalCompared} images: ` +
      `${report.matched} matched, ${report.changed} changed, ` +
      `${report.missing.length} missing, ${report.added.length} added`);

    return report;
  }

  /**
   * Compare two specific PNG images and optionally write a diff image.
   * If the images differ in size, the smaller one is padded to match.
   *
   * @param {string} img1Path - Path to baseline image
   * @param {string} img2Path - Path to current image
   * @param {string} [diffPath] - Where to save the diff image (optional)
   * @returns {{ diffPercent: number, diffPixels: number, totalPixels: number }}
   */
  async compareImages(img1Path, img2Path, diffPath) {
    const img1 = await this._readPNG(img1Path);
    const img2 = await this._readPNG(img2Path);

    // Use the larger dimensions so both images can be compared
    const width = Math.max(img1.width, img2.width);
    const height = Math.max(img1.height, img2.height);
    const totalPixels = width * height;

    // Pad images to the same dimensions if they differ
    const data1 = this._padImage(img1, width, height);
    const data2 = this._padImage(img2, width, height);

    const diff = new PNG({ width, height });

    const diffPixels = pixelmatch(data1, data2, diff.data, width, height, {
      threshold: this.threshold,
      diffColor: [255, 0, 0],       // red for changed pixels
      diffColorAlt: [0, 0, 255],    // blue for anti-aliased changes
      alpha: 0.3,
    });

    const diffPercent = totalPixels > 0
      ? Math.round((diffPixels / totalPixels) * 10000) / 100  // two decimal places
      : 0;

    // Write diff image if a path was provided and there are differences
    if (diffPath && diffPixels > 0) {
      fs.mkdirSync(path.dirname(diffPath), { recursive: true });
      const buffer = PNG.sync.write(diff);
      fs.writeFileSync(diffPath, buffer);
    }

    return { diffPercent, diffPixels, totalPixels };
  }

  /**
   * Set a directory as the new baseline by copying its PNGs into the baseline dir.
   * @param {string} [sourceDir] - Directory to copy from (defaults to currentDir)
   */
  setBaseline(sourceDir) {
    const src = sourceDir || this.currentDir;

    if (!fs.existsSync(src)) {
      throw new Error(`Source directory does not exist: ${src}`);
    }

    // Clear existing baseline
    if (fs.existsSync(this.baselineDir)) {
      const existing = this._listPNGs(this.baselineDir);
      for (const file of existing) {
        fs.unlinkSync(path.join(this.baselineDir, file));
      }
    }

    fs.mkdirSync(this.baselineDir, { recursive: true });

    const files = this._listPNGs(src);
    for (const file of files) {
      fs.copyFileSync(path.join(src, file), path.join(this.baselineDir, file));
    }

    console.log(`[VisualRegression] Baseline set from ${src} (${files.length} images)`);
    return files.length;
  }

  /**
   * Save screenshots from a Khai test run as a new baseline.
   * @param {string} testId - The Khai test ID (matches screenshot directory name)
   * @param {string} [screenshotsRoot] - Root screenshots directory
   * @returns {number} Number of files saved as baseline
   */
  static saveBaselineFromTest(testId, screenshotsRoot) {
    const root = screenshotsRoot || path.join(__dirname, '../../screenshots');
    const testDir = path.join(root, testId);

    if (!fs.existsSync(testDir)) {
      throw new Error(`Test screenshot directory not found: ${testDir}`);
    }

    const vr = new VisualRegression({ baselineDir: path.join(root, 'baseline') });
    return vr.setBaseline(testDir);
  }

  // ===========================
  // Internal helpers
  // ===========================

  /**
   * List PNG files in a directory (non-recursive, filenames only).
   */
  _listPNGs(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter(f => f.toLowerCase().endsWith('.png'))
      .sort();
  }

  /**
   * Read a PNG file and return a parsed PNG object.
   */
  _readPNG(filePath) {
    return new Promise((resolve, reject) => {
      const stream = fs.createReadStream(filePath).pipe(new PNG());
      stream.on('parsed', function () {
        resolve(this);
      });
      stream.on('error', (err) => {
        reject(new Error(`Failed to read PNG ${filePath}: ${err.message}`));
      });
    });
  }

  /**
   * Pad an image's raw RGBA data to target dimensions.
   * Extra pixels are filled with transparent black (0,0,0,0).
   */
  _padImage(img, targetWidth, targetHeight) {
    if (img.width === targetWidth && img.height === targetHeight) {
      return img.data;
    }

    const padded = Buffer.alloc(targetWidth * targetHeight * 4, 0);

    for (let y = 0; y < img.height; y++) {
      const srcOffset = y * img.width * 4;
      const dstOffset = y * targetWidth * 4;
      img.data.copy(padded, dstOffset, srcOffset, srcOffset + img.width * 4);
    }

    return padded;
  }
}

module.exports = VisualRegression;
