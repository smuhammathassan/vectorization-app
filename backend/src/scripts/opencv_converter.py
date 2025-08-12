#!/usr/bin/env python3
import cv2
import numpy as np
import json
import sys
import os

def create_svg_path(contour, scale_x=1, scale_y=1):
    """Convert OpenCV contour to SVG path string"""
    if len(contour) < 3:
        return ""
    
    path = f"M {contour[0][0][0] * scale_x} {contour[0][0][1] * scale_y}"
    
    for i in range(1, len(contour)):
        x, y = contour[i][0][0] * scale_x, contour[i][0][1] * scale_y
        path += f" L {x} {y}"
    
    path += " Z"
    return path

def process_image(image_path, output_path, params):
    """Process image using OpenCV and generate SVG with improved algorithms"""
    
    # Read image
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Could not read image: {image_path}")
    
    height, width = img.shape[:2]
    print(f"Processing image: {width}x{height}")
    
    # Apply smoothing if requested
    if params.get('smooth', True):
        img = cv2.GaussianBlur(img, (3, 3), 0)
    
    contours_list = []
    colors = []
    
    if params['colorMode'] == 'binary':
        # Enhanced binary processing with adaptive thresholding and edge detection
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # Apply histogram equalization for better contrast
        gray = cv2.equalizeHist(gray)
        
        # Use adaptive thresholding for better results with varying lighting
        adaptive_thresh = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
        )
        
        # Also create regular threshold for comparison
        threshold_val = params.get('threshold', 80)  # Lower default threshold
        _, regular_thresh = cv2.threshold(gray, threshold_val, 255, cv2.THRESH_BINARY)
        
        # Use Canny edge detection for better contour detection
        canny_low = max(50, threshold_val - 50)
        canny_high = min(255, threshold_val + 50)
        edges = cv2.Canny(gray, canny_low, canny_high)
        
        # Combine thresholding methods
        combined = cv2.bitwise_or(adaptive_thresh, regular_thresh)
        combined = cv2.bitwise_or(combined, edges)
        
        # Apply morphological operations to clean up the image
        kernel = np.ones((2,2), np.uint8)
        combined = cv2.morphologyEx(combined, cv2.MORPH_CLOSE, kernel)
        combined = cv2.morphologyEx(combined, cv2.MORPH_OPEN, kernel)
        
        # Find contours with hierarchical information
        contours, hierarchy = cv2.findContours(combined, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
        
        print(f"Found {len(contours)} contours")
        
        for i, contour in enumerate(contours):
            area = cv2.contourArea(contour)
            if area >= params['minArea']:
                # Better epsilon calculation
                arc_length = cv2.arcLength(contour, True)
                epsilon = params['epsilon'] * arc_length * 0.01  # Better epsilon calculation
                simplified = cv2.approxPolyDP(contour, epsilon, True)
                
                # Only add contours with sufficient complexity
                if len(simplified) >= 3:
                    contours_list.append(simplified)
                    colors.append('#000000')
        
        print(f"Kept {len(contours_list)} contours after filtering")
    
    elif params['colorMode'] == 'grayscale':
        # Enhanced grayscale processing with multiple sophisticated thresholds
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        gray = cv2.equalizeHist(gray)
        
        # Use more threshold levels for better detail
        threshold_levels = [32, 64, 96, 128, 160, 192, 224]
        
        for threshold in threshold_levels:
            # Adaptive thresholding
            adaptive_thresh = cv2.adaptiveThreshold(
                gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
            )
            
            # Regular thresholding
            _, binary = cv2.threshold(gray, threshold, 255, cv2.THRESH_BINARY)
            
            # Combine methods
            combined = cv2.bitwise_or(adaptive_thresh, binary)
            
            # Morphological operations
            kernel = np.ones((2,2), np.uint8)
            combined = cv2.morphologyEx(combined, cv2.MORPH_CLOSE, kernel)
            
            # Find contours
            contours, _ = cv2.findContours(combined, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
            
            gray_value = 255 - threshold
            color = f"rgb({gray_value},{gray_value},{gray_value})"
            
            for contour in contours:
                area = cv2.contourArea(contour)
                if area >= params['minArea']:
                    arc_length = cv2.arcLength(contour, True)
                    epsilon = params['epsilon'] * arc_length * 0.01
                    simplified = cv2.approxPolyDP(contour, epsilon, True)
                    
                    if len(simplified) >= 3:
                        contours_list.append(simplified)
                        colors.append(color)
    
    elif params['colorMode'] == 'color':
        # Enhanced color processing with better channel separation
        for channel, color_name in enumerate(['blue', 'green', 'red']):
            channel_img = img[:, :, channel]
            
            # Apply histogram equalization to each channel
            channel_img = cv2.equalizeHist(channel_img)
            
            # Use adaptive thresholding
            adaptive_thresh = cv2.adaptiveThreshold(
                channel_img, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
            )
            
            # Regular thresholding
            threshold_val = params.get('threshold', 80)
            _, regular_thresh = cv2.threshold(channel_img, threshold_val, 255, cv2.THRESH_BINARY)
            
            # Combine methods
            combined = cv2.bitwise_or(adaptive_thresh, regular_thresh)
            
            # Morphological operations
            kernel = np.ones((2,2), np.uint8)
            combined = cv2.morphologyEx(combined, cv2.MORPH_CLOSE, kernel)
            
            # Find contours
            contours, _ = cv2.findContours(combined, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
            
            color_values = [0, 0, 0]
            color_values[2 - channel] = 255  # BGR to RGB
            color = f"rgb({color_values[0]},{color_values[1]},{color_values[2]})"
            
            for contour in contours:
                area = cv2.contourArea(contour)
                if area >= params['minArea']:
                    arc_length = cv2.arcLength(contour, True)
                    epsilon = params['epsilon'] * arc_length * 0.01
                    simplified = cv2.approxPolyDP(contour, epsilon, True)
                    
                    if len(simplified) >= 3:
                        contours_list.append(simplified)
                        colors.append(color)
    
    # Generate SVG
    svg_content = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg width="{width}" height="{height}" viewBox="0 0 {width} {height}" 
     xmlns="http://www.w3.org/2000/svg">
'''
    
    for i, (contour, color) in enumerate(zip(contours_list, colors)):
        path_data = create_svg_path(contour)
        if path_data:
            svg_content += f'  <path d="{path_data}" fill="{color}" stroke="none"/>\n'
    
    svg_content += '</svg>'
    
    # Write SVG file
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(svg_content)
    
    # Output statistics for quality metrics
    print(f"STATS:contours={len(contours_list)},points={sum(len(c) for c in contours_list)}")

def main():
    if len(sys.argv) != 4:
        print("Usage: python opencv_converter.py <input_image> <output_svg> <params_json>")
        sys.exit(1)
    
    input_path = sys.argv[1].strip('"')
    output_path = sys.argv[2].strip('"')
    params_json = sys.argv[3].strip("'")
    
    try:
        params = json.loads(params_json)
        process_image(input_path, output_path, params)
        print("Conversion completed successfully")
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
