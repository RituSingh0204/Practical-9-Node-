

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const NODE_MODULES_ROOT = path.resolve(process.cwd(), 'node_modules'); // change if needed
const LICENSE_FILENAMES = [
  'LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENSE.MD', 'license', 'license.md',
  'COPYING', 'COPYING.md', 'UNLICENSE'
];

async function exists(p) {
  try { await fsp.access(p); return true; }
  catch(e){ return false; }
}

async function readJson(p) {
  try {
    const txt = await fsp.readFile(p, 'utf8');
    return JSON.parse(txt);
  } catch (e) {
    return null;
  }
}


async function computeDirSha256(dir) {
  const files = [];
  async function walk(curr) {
    const entries = await fsp.readdir(curr, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(curr, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules') continue; 
        await walk(full);
      } else if (e.isFile()) {
        files.push(full);
      }
    }
  }
  await walk(dir);


  const rels = files.map(f => path.relative(dir, f)).sort((a, b) => a.localeCompare(b, 'en'));

  const hash = crypto.createHash('sha256');
  for (const rel of rels) {
    const full = path.join(dir, rel);
    
    hash.update(rel.replace(/\\/g, '/'), 'utf8');
    hash.update('\0', 'utf8');
    const content = await fsp.readFile(full);
    hash.update(content);
    hash.update('\0', 'utf8');
  }
  return hash.digest('hex');
}


async function listTopLevelPackages(nodeModulesRoot) {
  if (!await exists(nodeModulesRoot)) return [];
  const entries = await fsp.readdir(nodeModulesRoot, { withFileTypes: true });
  const pkgs = [];
  for (const e of entries) {
    const full = path.join(nodeModulesRoot, e.name);
    if (e.isDirectory()) {
      if (e.name.startsWith('@')) {
       
        const scopeChildren = await fsp.readdir(full, { withFileTypes: true });
        for (const sc of scopeChildren) {
          if (sc.isDirectory()) {
            pkgs.push(path.join(full, sc.name));
          }
        }
      } else {
        pkgs.push(full);
      }
    }
  }
  return pkgs;
}

function packageIdFromPkgJson(pkgJson) {
  if (!pkgJson || !pkgJson.name) return null;
  const ver = pkgJson.version || '0.0.0';
  return `${pkgJson.name}@${ver}`;
}

async function findLicenseFile(dir) {
  for (const name of LICENSE_FILENAMES) {
    const p = path.join(dir, name);
    if (await exists(p)) return p;
  }
  
  const entries = await fsp.readdir(dir).catch(()=>[]);
  for (const e of entries) {
    const lower = e.toLowerCase();
    if (['license', 'license.md', 'license.txt', 'copying', 'unlicense'].includes(lower)) {
      return path.join(dir, e);
    }
  }
  return null;
}


(async () => {
  const nodeRoot = NODE_MODULES_ROOT;
  if (!await exists(nodeRoot)) {
    console.error(`No node_modules found at ${nodeRoot}. Exiting.`);
    process.exit(1);
  }


  const nodes = {}; 
  const nameToIds = {};

  const pkgDirs = await listTopLevelPackages(nodeRoot);

  async function processPackageDir(dir) {
    const pkgJsonPath = path.join(dir, 'package.json');
    const pkgJson = await readJson(pkgJsonPath);
    if (!pkgJson || !pkgJson.name) {
  
      return null;
    }
    const id = packageIdFromPkgJson(pkgJson);
    if (nodes[id]) return id;

    const sha256 = await computeDirSha256(dir).catch(err => {
      console.error(`Error hashing ${dir}:`, err.message);
      return null;
    });

    const licenseFile = await findLicenseFile(dir);
    const licenseFromFile = licenseFile ? (await fsp.readFile(licenseFile, 'utf8')).slice(0, 1000) : null; 
    const licenseField = pkgJson.license || null;

    const licenseSource = licenseFile ? 'file' : (licenseField ? 'package.json' : null);
    const missingLicense = licenseSource === null;

    const deps = Object.assign({}, pkgJson.dependencies || {}, pkgJson.optionalDependencies || {});

    const node = {
      id,
      name: pkgJson.name,
      version: pkgJson.version || '0.0.0',
      path: dir,
      sha256,
      license: licenseFile ? path.basename(licenseFile) : licenseField,
      licenseSource,
      missingLicense,
      declaredDependencies: Object.keys(deps)
    };
    nodes[id] = node;

    
    if (!nameToIds[pkgJson.name]) nameToIds[pkgJson.name] = [];
    nameToIds[pkgJson.name].push(id);

    return id;
  }

 
  for (const d of pkgDirs) {
    await processPackageDir(d);
  }

  
  function resolveInstalledPathForDependency(parentPkgPath, depName) {

    const trial1 = path.join(parentPkgPath, 'node_modules', depName);
    if (fs.existsSync(trial1)) return trial1;
   
    const trial2 = path.join(nodeRoot, depName);
    if (fs.existsSync(trial2)) return trial2;
  
    return null;
  }


  const processingQueue = Object.values(nodes).map(n => n.path);

  while (processingQueue.length) {
    const pkgPath = processingQueue.shift();
   
    const pj = await readJson(path.join(pkgPath, 'package.json'));
    if (!pj) continue;
    const declared = Object.assign({}, pj.dependencies || {}, pj.optionalDependencies || {});
    for (const depName of Object.keys(declared)) {
    
      const installedPath = resolveInstalledPathForDependency(pkgPath, depName);
      if (!installedPath) {
      
        continue;
      }
      const depPkgJson = await readJson(path.join(installedPath, 'package.json'));
      if (!depPkgJson || !depPkgJson.name) continue;
      const depId = packageIdFromPkgJson(depPkgJson);
      if (!nodes[depId]) {
       
        const newId = await processPackageDir(installedPath);
        if (newId) processingQueue.push(installedPath);
      }
    }
  }


  const edges = [];
  for (const id of Object.keys(nodes)) {
    const node = nodes[id];
    for (const depName of node.declaredDependencies) {
    
      const installedIds = nameToIds[depName] || [];
      if (installedIds.length === 0) {
      
        continue;
      }
     
      
      const targetId = installedIds[0];
      edges.push({ from: id, to: targetId, depName });
    }
  }


  const missing = Object.values(nodes).filter(n => n.missingLicense);
  console.error(`Scanned ${Object.keys(nodes).length} packages.`);
  console.error(`Packages missing license file or license field: ${missing.length}`);
  if (missing.length > 0) {
    for (const m of missing) {
      console.error(` - ${m.id} at ${m.path}`);
    }
  }

 
  const graph = {
    generatedAt: new Date().toISOString(),
    nodeModulesRoot: nodeRoot,
    nodes,
    edges
  };

  console.log(JSON.stringify(graph, null, 2));
})();
