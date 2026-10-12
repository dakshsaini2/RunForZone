"""
BGMI Offline Multi-Stage Zone Predictor - Option 1: Terrain Mask Generator
Extracts a high-precision binary terrain mask from an Erangel map image using OpenCV and NumPy.
Walkable land is marked as 255 (white) and water bodies/oceans are marked as 0 (black).
"""

import os
import argparse
import numpy as np
import cv2


def generate_synthetic_erangel_map(output_path: str, size: tuple = (2048, 2048)) -> np.ndarray:
    """
    Generates a realistic synthetic topographical base map of Erangel (Mainland, Sosnovka Island,
    Bridges, and Rivers) for testing and development when raw 8000x8000 assets are pending.
    """
    h, w = size
    # Ocean background (Deep blue/turquoise)
    canvas = np.zeros((h, w, 3), dtype=np.uint8)
    canvas[:, :] = [180, 120, 50]  # BGR ocean

    # Mainland (Northern big landmass)
    mainland_center = (int(w * 0.5), int(h * 0.42))
    cv2.ellipse(canvas, mainland_center, (int(w * 0.42), int(h * 0.34)), 0, 0, 360, (70, 150, 90), -1)
    
    # Mainland roughness/peninsulas
    cv2.circle(canvas, (int(w * 0.22), int(h * 0.28)), int(w * 0.16), (75, 140, 85), -1) # Georgopol
    cv2.circle(canvas, (int(w * 0.78), int(h * 0.32)), int(w * 0.15), (65, 135, 80), -1) # Lipovka
    cv2.circle(canvas, (int(w * 0.35), int(h * 0.65)), int(w * 0.13), (70, 145, 90), -1) # Primorsk
    cv2.circle(canvas, (int(w * 0.75), int(h * 0.62)), int(w * 0.12), (72, 148, 88), -1) # Mylta

    # Sosnovka Military Island (Southern island)
    sosnovka_center = (int(w * 0.5), int(h * 0.84))
    cv2.ellipse(canvas, sosnovka_center, (int(w * 0.28), int(h * 0.12)), 0, 0, 360, (65, 130, 80), -1)

    # South Canal/River (Carve water between Mainland and Sosnovka)
    canal_pts = np.array([
        [0, int(h * 0.71)],
        [w, int(h * 0.71)],
        [w, int(h * 0.75)],
        [0, int(h * 0.75)]
    ], dtype=np.int32)
    cv2.fillPoly(canvas, [canal_pts], (180, 120, 50))

    # Bridges connecting Mainland to Military Base
    # West Bridge
    cv2.rectangle(canvas, (int(w * 0.37), int(h * 0.70)), (int(w * 0.40), int(h * 0.76)), (120, 120, 120), -1)
    # East Bridge
    cv2.rectangle(canvas, (int(w * 0.60), int(h * 0.70)), (int(w * 0.63), int(h * 0.76)), (120, 120, 120), -1)

    # Rozhok inland river/canal
    river_pts = np.array([
        [int(w * 0.48), int(h * 0.35)],
        [int(w * 0.52), int(h * 0.45)],
        [int(w * 0.56), int(h * 0.55)],
        [int(w * 0.58), int(h * 0.71)]
    ], dtype=np.int32)
    cv2.polylines(canvas, [river_pts], isClosed=False, color=(175, 115, 45), thickness=int(w * 0.015))

    # Add subtle terrain noise
    noise = np.random.randint(-10, 10, (h, w, 3), dtype=np.int16)
    canvas = np.clip(canvas.astype(np.int16) + noise, 0, 255).astype(np.uint8)

    os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)
    cv2.imwrite(output_path, canvas)
    print(f"[Terrain Generator] Synthetic Erangel map written to: {output_path} ({w}x{h})")
    return canvas


def extract_terrain_mask(
    image: np.ndarray,
    blur_kernel: int = 5,
    morph_kernel_size: int = 7,
    erosion_iterations: int = 1,
    dilation_iterations: int = 2
) -> np.ndarray:
    """
    Extracts a binary terrain mask from the given map image.
    Walkable Land = 255 (White), Water/Ocean = 0 (Black).

    Processing Pipeline:
      1. Color Space Conversion (BGR -> HSV and RGB analysis)
      2. Water Color Thresholding (Hue range for ocean/rivers + RGB water dominance)
      3. Median Blur for pixel noise reduction
      4. Morphological Opening (removes tiny isolated water artifacts on land)
      5. Morphological Closing (closes small gaps across bridges and roads)
      6. Erosion & Dilation for clean coastline boundary delineation
    """
    h, w = image.shape[:2]
    print(f"[Terrain Mask] Processing image size: {w}x{h}...")

    # Step 1: Color Space Conversion
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    b_channel = image[:, :, 0].astype(np.int16)
    g_channel = image[:, :, 1].astype(np.int16)
    r_channel = image[:, :, 2].astype(np.int16)

    # Step 2: Multi-Criteria Water Thresholding
    # Criteria A: HSV blue/cyan spectrum (H in [85, 140], S >= 25, V >= 25)
    lower_hsv_water = np.array([85, 25, 25], dtype=np.uint8)
    upper_hsv_water = np.array([140, 255, 255], dtype=np.uint8)
    hsv_water_mask = cv2.inRange(hsv, lower_hsv_water, upper_hsv_water)

    # Criteria B: Blue channel dominance (B > R + 15 and B > G - 10)
    rgb_water_condition = (b_channel > (r_channel + 15)) & (b_channel > (g_channel - 15))
    rgb_water_mask = np.where(rgb_water_condition, 255, 0).astype(np.uint8)

    # Combine water masks (Logical OR: marked as water if matching either signature)
    combined_water = cv2.bitwise_or(hsv_water_mask, rgb_water_mask)

    # Invert to obtain initial Land mask: Land = 255, Water = 0
    land_mask = cv2.bitwise_not(combined_water)

    # Step 3: Noise Filtering
    if blur_kernel > 1:
        if blur_kernel % 2 == 0:
            blur_kernel += 1
        land_mask = cv2.medianBlur(land_mask, blur_kernel)

    # Step 4 & 5: Morphological Operations
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (morph_kernel_size, morph_kernel_size))

    # Opening: removes false-positive land pixels in the middle of the sea (e.g. boats, glare)
    opened = cv2.morphologyEx(land_mask, cv2.MORPH_OPEN, kernel, iterations=1)

    # Closing: fills small holes and retains bridge connections across rivers
    closed = cv2.morphologyEx(opened, cv2.MORPH_CLOSE, kernel, iterations=1)

    # Step 6: Coastline Refinement (Erosion & Dilation)
    # Erode to eliminate ragged coastline artifacts, then Dilate to restore landmass contours
    eroded = cv2.erode(closed, kernel, iterations=erosion_iterations)
    dilated = cv2.dilate(eroded, kernel, iterations=dilation_iterations)

    # Ensure strictly binary 0 or 255 output
    _, final_mask = cv2.threshold(dilated, 127, 255, cv2.THRESH_BINARY)

    land_percentage = (np.count_nonzero(final_mask == 255) / (w * h)) * 100.0
    print(f"[Terrain Mask] Extraction complete. Walkable land area: {land_percentage:.2f}%")
    return final_mask


def save_terrain_mask(mask: np.ndarray, output_path: str, preview_path: str = None, original_image: np.ndarray = None):
    """
    Saves the final binary mask to disk and optionally exports a visual side-by-side preview.
    """
    os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)
    cv2.imwrite(output_path, mask)
    print(f"[Terrain Mask] Binary terrain mask saved to: {output_path}")

    if preview_path and original_image is not None:
        os.makedirs(os.path.dirname(preview_path) or '.', exist_ok=True)
        # Create 1024x1024 side-by-side comparison thumbnail
        preview_h = 1024
        aspect = original_image.shape[1] / original_image.shape[0]
        preview_w = int(preview_h * aspect)

        orig_thumb = cv2.resize(original_image, (preview_w, preview_h), interpolation=cv2.INTER_AREA)
        mask_bgr = cv2.cvtColor(cv2.resize(mask, (preview_w, preview_h), interpolation=cv2.INTER_NEAREST), cv2.COLOR_GRAY2BGR)

        # Highlight walkable land in semi-transparent green overlay on original
        overlay = orig_thumb.copy()
        green_tint = np.zeros_like(orig_thumb)
        green_tint[:, :] = [0, 220, 0]
        land_bool = mask_bgr[:, :, 0] > 127
        overlay[land_bool] = cv2.addWeighted(orig_thumb[land_bool], 0.6, green_tint[land_bool], 0.4, 0)

        side_by_side = np.hstack([orig_thumb, overlay, mask_bgr])
        cv2.imwrite(preview_path, side_by_side)
        print(f"[Terrain Mask] Visual preview saved to: {preview_path}")


def main():
    parser = argparse.ArgumentParser(description="BGMI Offline Zone Predictor - Terrain Mask Generator")
    parser.add_argument("--input", "-i", type=str, default="data/raw/erangel_map.png",
                        help="Path to high-resolution Erangel map image")
    parser.add_argument("--output", "-o", type=str, default="data/masks/erangel_mask.png",
                        help="Path to output binary mask (walkable land=255, water=0)")
    parser.add_argument("--preview", "-p", type=str, default="outputs/erangel_mask_preview.png",
                        help="Path to output side-by-side preview")
    parser.add_argument("--generate-synthetic", action="store_true",
                        help="Generate a synthetic Erangel map if raw asset is not available")
    parser.add_argument("--size", type=int, default=2048,
                        help="Dimension (pixels) for synthetic map generation (default 2048, up to 8000)")
    args = parser.parse_args()

    # If raw input does not exist or user requested synthetic generation
    if not os.path.exists(args.input) or args.generate_synthetic:
        print(f"[Terrain Mask] Input '{args.input}' not found or synthetic generation requested.")
        img = generate_synthetic_erangel_map(args.input, size=(args.size, args.size))
    else:
        print(f"[Terrain Mask] Loading map image from: {args.input}")
        img = cv2.imread(args.input)
        if img is None:
            raise FileNotFoundError(f"Failed to load image from {args.input}")

    mask = extract_terrain_mask(img)
    save_terrain_mask(mask, args.output, args.preview, original_image=img)


if __name__ == "__main__":
    main()
