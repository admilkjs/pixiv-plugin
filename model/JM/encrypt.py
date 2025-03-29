import sys
import fitz  # PyMuPDF

def encrypt_pdf(input_path, output_path, password):
    try:
        # 直接打开PDF文件
        doc = fitz.open(input_path)
        # 使用AES-256加密并保存，同时设置用户密码和所有者密码
        doc.save(output_path, encryption=fitz.PDF_ENCRYPT_AES_256,
                 user_pw=password, owner_pw=password)
        print("加密成功")
        return True
    except Exception as e:
        print(f"加密失败: {e}", file=sys.stderr)
        return False

if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Usage: python script.py input.pdf output.pdf password", file=sys.stderr)
        sys.exit(1)
    input_pdf = sys.argv[1]
    output_pdf = sys.argv[2]
    password = sys.argv[3]
    
    if encrypt_pdf(input_pdf, output_pdf, password):
        sys.exit(0)
    else:
        sys.exit(1)