const sharp = require('sharp');

const MAX_IMAGE_SIZE = 800;    // Maximum width/height in pixels
const IMAGE_QUALITY = 70;      // JPEG quality (1-100)
const MAX_TOTAL_SIZE = 8000000; // 8MB total limit

const validateAndOptimizeImages = async (images) => {
  const totalSize = images.reduce((sum, img) => sum + img.length, 0);
  console.log('[Server Timing] Initial image stats:', {
    totalSize: totalSize,
    averageSize: totalSize / images.length,
    imageCount: images.length
  });

  const optimizedImages = await Promise.all(images.map(async (img, index) => {
    try {
      // Remove data URL prefix if exists
      const base64Data = img.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      // Optimize image using Sharp
      const optimizedBuffer = await sharp(buffer)
        .resize(MAX_IMAGE_SIZE, MAX_IMAGE_SIZE, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({
          quality: IMAGE_QUALITY,
          progressive: true,
          optimizeCoding: true,
          mozjpeg: true
        })
        .toBuffer();

      console.log(`[Server] Image ${index + 1} optimized:`, {
        originalSize: buffer.length,
        optimizedSize: optimizedBuffer.length,
        reduction: `${((1 - optimizedBuffer.length / buffer.length) * 100).toFixed(2)}%`
      });

      return optimizedBuffer.toString('base64');
    } catch (err) {
      console.error('[Server] Image optimization failed:', err);
      return img.replace(/^data:image\/\w+;base64,/, '');
    }
  }));

  const newTotalSize = optimizedImages.reduce((sum, img) => sum + img.length, 0);
  console.log('[Server Timing] Optimization results:', {
    originalSize: totalSize,
    optimizedSize: newTotalSize,
    reduction: `${((1 - newTotalSize / totalSize) * 100).toFixed(2)}%`
  });

  return optimizedImages;
};

module.exports = {
  validateAndOptimizeImages,
  MAX_IMAGE_SIZE,
  IMAGE_QUALITY,
  MAX_TOTAL_SIZE
}; 