const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { initializeDatabase, DatabaseService } = require('./database');

const app = express();
const PORT = 3000;

// Initialize database
initializeDatabase();
const dbService = new DatabaseService();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Default save location
const DEFAULT_SAVE_PATH = path.join(__dirname, 'project-2025');

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = path.join(__dirname, 'uploads', 'temp');
    fs.ensureDirSync(tempDir);
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// Helper function to generate clean project folder name with timestamp
function generateFolderName(projectName) {
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19);
  return `${projectName}_${timestamp}`;
}

// Helper function to create project folder structure
async function createProjectStructure(basePath, projectName) {
  const folderName = generateFolderName(projectName);
  const projectPath = path.join(basePath, folderName);
  
  // Create directory structure
  await fs.ensureDir(path.join(projectPath, 'README'));
  await fs.ensureDir(path.join(projectPath, 'INSTALLATION'));
  await fs.ensureDir(path.join(projectPath, 'SOURCE'));
  
  return { projectPath, folderName };
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/search', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'search.html'));
});

// API to check default location and ask user preference
app.post('/api/location-preference', async (req, res) => {
  try {
    const { useDefault } = req.body;
    
    if (useDefault) {
      // Ensure default directory exists
      await fs.ensureDir(DEFAULT_SAVE_PATH);
      res.json({ success: true, path: DEFAULT_SAVE_PATH });
    } else {
      // Return message for client to show folder picker
      res.json({ success: true, needsFolderPicker: true });
    }
  } catch (error) {
    console.error('Error handling location preference:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API to create project folder
app.post('/api/create-project', async (req, res) => {
  try {
    const { projectName, savePath } = req.body;
    
    if (!projectName || !savePath) {
      return res.status(400).json({ success: false, error: 'Project name and save path are required' });
    }
    
    // Ensure save path exists
    await fs.ensureDir(savePath);
    
    // Create project structure
    const { projectPath, folderName } = await createProjectStructure(savePath, projectName);
    
    res.json({ 
      success: true, 
      projectPath, 
      folderName,
      message: 'Project folder created successfully'
    });
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API to upload README file
app.post('/api/upload-readme', upload.single('readme'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    
    const { projectPath } = req.body;
    if (!projectPath) {
      return res.status(400).json({ success: false, error: 'Project path is required' });
    }
    
    // Move file to README folder
    const readmePath = path.join(projectPath, 'README', 'ReadMe.txt');
    await fs.move(req.file.path, readmePath, { overwrite: true });
    
    res.json({ 
      success: true, 
      readmePath,
      fileName: 'ReadMe.txt',
      fileSize: req.file.size
    });
  } catch (error) {
    console.error('Error uploading README:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API to upload installation file
app.post('/api/upload-installation', upload.single('installation'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    
    const { projectPath } = req.body;
    if (!projectPath) {
      return res.status(400).json({ success: false, error: 'Project path is required' });
    }
    
    // Get file extension
    const ext = path.extname(req.file.originalname);
    const installPath = path.join(projectPath, 'INSTALLATION', `installation${ext}`);
    
    // Move file to INSTALLATION folder
    await fs.move(req.file.path, installPath, { overwrite: true });
    
    res.json({ 
      success: true, 
      installPath,
      fileName: `installation${ext}`,
      fileSize: req.file.size
    });
  } catch (error) {
    console.error('Error uploading installation file:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API to upload source code ZIP
app.post('/api/upload-source', upload.single('source'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    
    const { projectPath } = req.body;
    if (!projectPath) {
      return res.status(400).json({ success: false, error: 'Project path is required' });
    }
    
    // Move file to SOURCE folder
    const sourcePath = path.join(projectPath, 'SOURCE', 'project.zip');
    await fs.move(req.file.path, sourcePath, { overwrite: true });
    
    res.json({ 
      success: true, 
      sourcePath,
      fileName: 'project.zip',
      fileSize: req.file.size
    });
  } catch (error) {
    console.error('Error uploading source file:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API to save project metadata and complete submission
app.post('/api/complete-project', async (req, res) => {
  try {
    const { 
      projectName, 
      teamMembers, 
      projectPath, 
      folderName,
      readmeFile,
      installationFile,
      sourceFile
    } = req.body;
    
    if (!projectName || !teamMembers || !projectPath) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    
    // Create project metadata
    const projectData = {
      id: uuidv4(),
      projectName,
      timestamp: new Date().toISOString(),
      teamMembers: teamMembers.map(member => ({
        name: member.name,
        usn: member.usn
      })),
      folderName,
      projectPath,
      files: {
        readme: {
          name: 'ReadMe.txt',
          path: path.join(projectPath, 'README', 'ReadMe.txt'),
          size: readmeFile.size || 0
        },
        installation: {
          name: installationFile.name,
          path: path.join(projectPath, 'INSTALLATION', installationFile.name),
          size: installationFile.size || 0
        },
        source: {
          name: 'project.zip',
          path: path.join(projectPath, 'SOURCE', 'project.zip'),
          size: sourceFile.size || 0
        }
      }
    };
    
    // Save to database
    dbService.createProject(projectData);
    
    // Create student information text file
    const studentInfoContent = teamMembers.map((member, index) => 
      `Student ${index + 1}:\nName: ${member.name}\nUSN: ${member.usn}\n`
    ).join('\n');
    
    const studentInfoPath = path.join(projectPath, 'student-info.txt');
    await fs.writeFile(studentInfoPath, studentInfoContent, 'utf8');
    
    // Update project data to include student info file
    projectData.files.studentInfo = {
      name: 'student-info.txt',
      path: studentInfoPath,
      size: studentInfoContent.length || 0
    };
    
    // Save project-info.json in project folder
    const infoPath = path.join(projectPath, 'project-info.json');
    await fs.writeJson(infoPath, projectData, { spaces: 2 });
    
    res.json({ 
      success: true, 
      projectData,
      message: 'Project submitted successfully'
    });
  } catch (error) {
    console.error('Error completing project:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API to search projects
app.get('/api/search', async (req, res) => {
  try {
    const { query, type } = req.query;
    
    const projects = dbService.searchProjects(query, type);
    
    res.json({ success: true, projects });
  } catch (error) {
    console.error('Error searching projects:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API to get all projects
app.get('/api/projects', async (req, res) => {
  try {
    const projects = dbService.getAllProjects();
    res.json({ success: true, projects });
  } catch (error) {
    console.error('Error getting projects:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API to get project details by ID
app.get('/api/project/:id', async (req, res) => {
  try {
    const projectId = req.params.id;
    const project = dbService.getProjectById(projectId);
    
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    res.json({ success: true, project });
  } catch (error) {
    console.error('Error getting project details:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API to download project files
app.get('/api/download/:projectId/:fileType', async (req, res) => {
  try {
    const { projectId, fileType } = req.params;
    
    // Get project details
    const project = dbService.getProjectById(projectId);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    // Get file path
    let fileData = project.files[fileType];
    
    // Handle studentInfo file for backward compatibility
    if (fileType === 'studentInfo' && !fileData) {
      const studentInfoPath = path.join(project.projectPath, 'student-info.txt');
      if (fs.existsSync(studentInfoPath)) {
        fileData = {
          name: 'student-info.txt',
          path: studentInfoPath
        };
      }
    }
    
    if (!fileData || !fileData.path) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }
    
    const filePath = fileData.path;
    const fileName = fileData.name;
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'File not found on disk' });
    }
    
    // Download file
    res.download(filePath, fileName, (err) => {
      if (err) {
        console.error('Error downloading file:', err);
        res.status(500).json({ success: false, error: 'Error downloading file' });
      }
    });
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API to download entire project as ZIP
app.get('/api/download-project/:projectId', async (req, res) => {
  try {
    const projectId = req.params.id;
    
    // Get project details
    const project = dbService.getProjectById(projectId);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    // Check if project folder exists
    if (!fs.existsSync(project.projectPath)) {
      return res.status(404).json({ success: false, error: 'Project folder not found' });
    }
    
    // Download entire project folder
    const archiver = require('archiver');
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    // Set response headers
    res.attachment(`${project.folderName}.zip`);
    
    // Pipe archive to response
    archive.pipe(res);
    
    // Append entire project directory
    archive.directory(project.projectPath, project.folderName);
    
    // Finalize archive
    archive.finalize();
  } catch (error) {
    console.error('Error downloading project:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API to get database statistics
app.get('/api/stats', async (req, res) => {
  try {
    const stats = dbService.getStats();
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API to compact database
app.post('/api/compact-database', async (req, res) => {
  try {
    const success = dbService.compactDatabase();
    res.json({ success, message: success ? 'Database compacted successfully' : 'Failed to compact database' });
  } catch (error) {
    console.error('Error compacting database:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Student Project Portal running on http://localhost:${PORT}`);
  console.log(`Default save location: ${DEFAULT_SAVE_PATH}`);
  console.log('Database: JSON (projects.json)');
  console.log('Features: Multi-system compatible, no compilation required');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  process.exit(0);
});