from pathlib import Path
import fitz
import zipfile
import xml.etree.ElementTree as ET

out = Path(".agents/outputs/hr-forms")
out.mkdir(parents=True, exist_ok=True)
for pattern in ["نموذج*1781419263295.pdf", "وثيقة_التشغيل*.pdf"]:
    for source in Path("attached_assets").glob(pattern):
        doc = fitz.open(source)
        for index, page in enumerate(doc):
            page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5)).save(out / f"{source.stem}-{index+1}.png")
        print(source.name, doc.page_count)
        (out / f"{source.stem}.txt").write_text("\n".join(f"\n--- PAGE {i+1} ---\n" + p.get_text() for i, p in enumerate(doc)))
for pattern in ["HR_Module*.docx", "HR_System*.docx", "تيك*.docx", "مباشرة*1781419263295.docx"]:
    for source in Path("attached_assets").glob(pattern):
        with zipfile.ZipFile(source) as z:
            root = ET.fromstring(z.read("word/document.xml"))
            text = "\n".join("".join(p.itertext()) for p in root.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p"))
            (out / f"{source.stem}.txt").write_text(text)
