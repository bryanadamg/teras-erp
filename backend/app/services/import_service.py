import csv
import io
from sqlalchemy.orm import Session
from app.models.item import Item
from app.models.uom import UOM
from app.models.category import Category

def import_items_csv(db: Session, file_content: bytes):
    """
    Parses a CSV file and bulk creates items.
    Expected Header: Code, Name, UOM, Category
    """
    stream = io.StringIO(file_content.decode("utf-8"))
    reader = csv.DictReader(stream)
    
    results = {"success": 0, "errors": []}
    
    for row_num, row in enumerate(reader, start=1):
        try:
            code = row.get("Code", "").strip()
            name = row.get("Name", "").strip()
            uom_name = row.get("UOM", "").strip()
            cat_name = row.get("Category", "").strip()
            
            if not code or not name or not uom_name:
                results["errors"].append(f"Row {row_num}: Missing required fields (Code, Name, UOM)")
                continue
                
            # Check duplicate Code
            if db.query(Item).filter(Item.code == code).first():
                results["errors"].append(f"Row {row_num}: Item code '{code}' already exists")
                continue
                
            # Check/Create UOM (Auto-create or Validate?)
            # Strict mode: UOM must exist. Loose mode: Create it. We'll go with strict for now to avoid mess.
            # Actually, standard practice is strict for attributes, but maybe loose for simple UOMs?
            # Let's verify UOM exists
            uom = db.query(UOM).filter(UOM.name == uom_name).first()
            if not uom:
                # results["errors"].append(f"Row {row_num}: UOM '{uom_name}' not found")
                # continue
                # Auto-create for UX convenience
                uom = UOM(name=uom_name)
                db.add(uom)
                db.commit()
                db.refresh(uom)

            # Check/Create Category
            if cat_name:
                category = db.query(Category).filter(Category.name == cat_name).first()
                if not category:
                    category = Category(name=cat_name)
                    db.add(category)
                    db.commit()
            
            # Create Item
            item = Item(
                code=code,
                name=name,
                uom=uom_name,
                category=cat_name
            )
            db.add(item)
            db.commit()
            results["success"] += 1
            
        except Exception as e:
            db.rollback()
            results["errors"].append(f"Row {row_num}: {str(e)}")
            
    return results

def generate_items_template():
    """Generates a CSV template for items."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Code", "Name", "UOM", "Category"])
    writer.writerow(["ITM-001", "Example Item", "pcs", "Raw Material"])
    return output.getvalue()
