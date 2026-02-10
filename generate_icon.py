import struct

def create_ico(path):
    # 256x256 Icon
    width = 256
    height = 256
    bpp = 32
    
    # 0 in width/height fields of ICO directory entry means 256
    ico_width = 0
    ico_height = 0
    
    pixel_data_size = width * height * 4
    mask_data_size = ((width + 31) // 32) * 4 * height
    
    total_bmp_size = 40 + pixel_data_size + mask_data_size
    file_offset = 22 # 6 (header) + 16 (dir entry)
    
    # Icon Header
    header = struct.pack('<HHH', 0, 1, 1)
    
    # Directory Entry
    entry = struct.pack('<BBBBHHII', ico_width, ico_height, 0, 0, 1, bpp, total_bmp_size, file_offset)
    
    # BITMAPINFOHEADER (height is doubled for XOR + AND masks)
    bmp_info = struct.pack('<IiiHHIIiiII', 40, width, height * 2, 1, bpp, 0, pixel_data_size + mask_data_size, 0, 0, 0, 0)
    
    # Indigo Pixel Data (BGRA) - Matching Teras ERP brand color #4F46E5
    # Hex #4F46E5 -> R:79, G:70, B:229
    pixel = struct.pack('<BBBB', 229, 70, 79, 255) * (width * height)
    
    # Mask (1 bit per pixel, padded to 32 bits)
    # 0 = opaque
    mask = b'\x00' * mask_data_size
    
    with open(path, 'wb') as f:
        f.write(header)
        f.write(entry)
        f.write(bmp_info)
        f.write(pixel)
        f.write(mask)
        
    print(f"Generated 256x256 icon at {path}")

if __name__ == "__main__":
    create_ico("electron/resources/icon.ico")