import os
import urllib.request
from PIL import Image, ImageDraw, ImageFilter

base_img_path = 'public/LOGO.png'
base_img = Image.open(base_img_path).convert('RGBA')

w, h = base_img.size

# Badge settings
badge_size = int(w * 0.35)  # 35% of the width
margin = int(w * 0.05)
badge_x = w - badge_size - margin
badge_y = h - badge_size - margin

roles = {
    'student': {
        'icon_url': 'https://img.icons8.com/fluency/256/graduation-cap.png',
        'color': '#3b82f6' # Blue
    },
    'teacher': {
        'icon_url': 'https://img.icons8.com/fluency/256/school-director.png',
        'color': '#10b981' # Green
    },
    'admin': {
        'icon_url': 'https://img.icons8.com/fluency/256/shield.png',
        'color': '#ef4444' # Red
    },
    'accountant': {
        'icon_url': 'https://img.icons8.com/fluency/256/calculator.png',
        'color': '#f59e0b' # Amber/Gold
    },
    'supervisor': {
        'icon_url': 'https://img.icons8.com/fluency/256/visible.png',
        'color': '#8b5cf6' # Purple
    }
}

for role, data in roles.items():
    print(f"Generating for {role}")
    
    # Download icon
    icon_path = f"tmp_icon_{role}.png"
    urllib.request.urlretrieve(data['icon_url'], icon_path)
    
    icon_img = Image.open(icon_path).convert('RGBA')
    
    # Resize icon
    icon_size = int(badge_size * 0.70)
    icon_img = icon_img.resize((icon_size, icon_size), Image.Resampling.LANCZOS)
    
    # Create an empty badge layer
    badge_layer = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(badge_layer)
    
    # Draw premium circle (outer white + inner color + shadow effect)
    shadow_offset = int(w * 0.01)
    
    # Draw shadow
    draw.ellipse(
        [badge_x + shadow_offset, badge_y + shadow_offset, badge_x + badge_size + shadow_offset, badge_y + badge_size + shadow_offset],
        fill=(0, 0, 0, 80)
    )
    
    # Draw white border
    border_width = int(w * 0.03)
    draw.ellipse(
        [badge_x, badge_y, badge_x + badge_size, badge_y + badge_size],
        fill='white'
    )
    
    # Draw colored inner circle
    draw.ellipse(
        [badge_x + border_width, badge_y + border_width, badge_x + badge_size - border_width, badge_y + badge_size - border_width],
        fill=data['color']
    )
    
    # Composite the icon on the badge layer
    icon_x = badge_x + (badge_size - icon_size) // 2
    icon_y = badge_y + (badge_size - icon_size) // 2
    badge_layer.paste(icon_img, (icon_x, icon_y), icon_img)
    
    # Combine with base
    final_img = Image.alpha_composite(base_img, badge_layer)
        
    final_img.save(f"public/logo-{role}.png")
    os.remove(icon_path)
    print(f"Saved public/logo-{role}.png")

print("All icons generated successfully.")
