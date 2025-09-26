Autoload version — host on GitHub Pages or any static server
=================================================================

Folder layout (recommended):
  /index.html
  /style.css
  /script.js
  /groups/Class1.txt
  /pics/  (images here; base name matches name in txt)

How it works:
- On page load, it tries to fetch the groups file and images by URL.
- Defaults:
  - group=groups/Class1.txt
  - pics=pics
- You can override via URL params:
  - ?group=groups/MyClass.txt
  - ?pics=picsFolderName

Examples:
- https://<your-user>.github.io/<repo>/?group=groups/Class2.txt
- https://<your-user>.github.io/<repo>/?group=groups/ClassA.txt&pics=Student%20Pics

Notes:
- If you use a folder name with spaces (e.g., "Student Pics"), URL-encode it:
  - pics=Student%20Pics
- Image match priority per name: .jpg → .jpeg → .png
- The app uses HEAD to check which image exists before using it.
- For private repos, GitHub Pages must be enabled (public), or host elsewhere with proper CORS.
- Manual file pickers remain available as a fallback/override.
