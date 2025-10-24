# Practical 9 - Dependency Graph and License Detector

## Student Information
Name: Ritu Singh  
Roll No: GF202346594  
Course: BCA Full Stack Development  
Year: Final Year

---

## Aim
To develop a Node.js script that scans all installed packages in the node_modules folder, computes SHA-256 checksums, detects license files, and generates a dependency graph of all packages.

---

## Procedure

1. Open the folder "Practical 9" in Visual Studio Code.

2. Initialize npm for the project:
   npm init -y

3. Install sample dependencies:
   npm install express lodash

4. Create a new file called build-graph.js and paste the provided Node.js script inside it.

5. Run the script in the terminal:
   node build-graph.js > dependency-graph.json

6. View the results:
   - The generated dependency-graph.json file will contain the dependency list and SHA-256 hashes.
   - The terminal will show which packages are missing a license file.

---

## Example Output
Scanned 10 packages.
Packages missing license file or license field: 2
 - express@4.18.2
 - lodash@4.17.21

---

## Result
The program successfully scanned all installed dependencies, computed their SHA-256 hash values, and reported packages without license files. It demonstrates how Node.js can be used for file system operations and dependency management.

---

## Tools and Technologies
- Node.js
- Visual Studio Code
- npm
