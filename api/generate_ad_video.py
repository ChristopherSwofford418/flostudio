import sys
import os
import cv2
import numpy as np

def generate_video(output_path, title="FLOSTUDIO", subtitle="PORTFOLIO MARKETING OS", format_name="PRODUCT SHOWCASE"):
    width, height = 720, 1280
    fps = 30
    duration_seconds = 6
    total_frames = fps * duration_seconds
    
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
    
    if not out.isOpened():
        # Fallback to avc1 or MJPG if mp4v fails
        fourcc = cv2.VideoWriter_fourcc(*'MJPG')
        out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
    
    for f in range(total_frames):
        progress = f / total_frames
        # Background: deep ink green gradient
        bg = np.zeros((height, width, 3), dtype=np.uint8)
        bg[:, :] = (16, 38, 26) # BGR: deep forest/ink green
        
        # Add subtle animated gradient circles
        center_x = int(width / 2 + np.sin(progress * np.pi * 2) * 100)
        center_y = int(height / 3 + np.cos(progress * np.pi) * 80)
        cv2.circle(bg, (center_x, center_y), 350, (30, 75, 48), -1)
        
        # Draw central mockup container (phone screen / dashboard card)
        card_w, card_h = 560, 780
        card_x = (width - card_w) // 2
        card_y = 220
        
        # Card shadow / glow
        cv2.rectangle(bg, (card_x - 6, card_y - 6), (card_x + card_w + 6, card_y + card_h + 6), (40, 120, 75), -1)
        # Card body
        cv2.rectangle(bg, (card_x, card_y), (card_x + card_w, card_y + card_h), (11, 26, 18), -1)
        
        # Header bar inside card
        cv2.rectangle(bg, (card_x, card_y), (card_x + card_w, card_y + 80), (20, 46, 32), -1)
        cv2.putText(bg, title[:20], (card_x + 30, card_y + 50), cv2.FONT_HERSHEY_DUPLEX, 1.0, (201, 242, 93), 2, cv2.LINE_AA)
        
        # Badge
        cv2.putText(bg, format_name[:25], (card_x + 300, card_y + 48), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (160, 190, 170), 1, cv2.LINE_AA)
        
        # Animated growth chart / dashboard bars inside card
        chart_y = card_y + 160
        bar_widths = [320, 440, 380, 480, 500]
        for i, bw in enumerate(bar_widths):
            bx = card_x + 40
            by = chart_y + i * 90
            bh = 50
            # Bar background
            cv2.rectangle(bg, (bx, by), (bx + 480, by + bh), (18, 40, 27), -1)
            # Animated fill
            anim_bw = int(bw * min(1.0, progress * 1.5))
            cv2.rectangle(bg, (bx, by), (bx + anim_bw, by + bh), (201, 242, 93) if i == 4 else (60, 150, 95), -1)
            # Label
            cv2.putText(bg, f"METRIC {i+1} / GROWTH", (bx + 15, by + 32), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (230, 240, 235), 1, cv2.LINE_AA)
            
        # Bottom tagline
        cv2.putText(bg, subtitle[:35], (card_x + 40, card_y + card_h - 60), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (201, 242, 93), 2, cv2.LINE_AA)
        
        # Footer branding
        cv2.putText(bg, "POWERED BY FLOSTUDIO OS", (width // 2 - 180, height - 80), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (120, 160, 140), 1, cv2.LINE_AA)
        
        out.write(bg)
        
    out.release()
    print(f"Video successfully generated at {output_path}")

if __name__ == '__main__':
    out_file = sys.argv[1] if len(sys.argv) > 1 else '/home/ubuntu/flostudio/public/sample-ad.mp4'
    os.makedirs(os.path.dirname(out_file), exist_ok=True)
    generate_video(out_file)
