# encrypt.py
import sys
import os
from PyPDF2 import PdfReader, PdfWriter

def encrypt_pdf(input_path, output_path, password):
    try:
        if not os.path.exists(input_path):
            raise FileNotFoundError(f"输入文件 {input_path} 不存在")
        reader = PdfReader(input_path)
        writer = PdfWriter()

        for page in reader.pages:
            writer.add_page(page)
        writer.encrypt(
            user_password=password,
            owner_password=password,
        )
        with open(output_path, "wb") as f:
            writer.write(f)
        print(f"加密成功")
        return True
    except Exception as e:
        print(f"加密失败: {str(e)}", file=sys.stderr)
        return False

if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit(1)
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    password = sys.argv[3]
    success = encrypt_pdf(input_path, output_path, password)
    sys.exit(0 if success else 1)