const express = require('express');
const multer = require('multer');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

// Validate required environment variables
const requiredEnvVars = ['GROQ_API_KEY'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
if (missingEnvVars.length > 0) {
  console.error('Missing required environment variables:', missingEnvVars.join(', '));
  process.exit(1);
}

const app = express();

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, process.env.UPLOAD_DIR || 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed!'), false);
    }
  },
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024 // Default to 5MB if not specified
  }
});

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());

// Create uploads directory if it doesn't exist
const fs = require('fs');
const uploadDir = process.env.UPLOAD_DIR || 'uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Routes
app.post('/api/summarize', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    console.log('Processing file:', req.file.originalname);

    // TODO: Implement AWS Lambda PDF extraction
    // For now, we'll just simulate the extracted text
    const extractedText = "I’m Arjun Jadhav, a Computer Engineering graduate from the 2024 batch with a strong foundation in Data Structures and Algorithms, holding 3⭐ ratings on both LeetCode and CodeChef. With over 1000 problems solved across various platforms and a top 1% rank on Coding Ninjas, I actively participate in contests (LeetCode Global Rank: 864/34,172 – Contest 407).On the development side, I’ve built full-stack applications using React, Node.js, and TypeScript, with recent projects involving AI tools, real-time chat systems using Socket.IO, and a bug-tracking dashboard using Next.js. I’m currently working at Accelya as a QA Automation Engineer and looking to transition into a full-time React or full-stack development role.I’m passionate about clean code, performance optimization, and building tools that solve real-world problems.";

    console.log('Sending request to Groq API...');

    // Generate summary using Groq
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant that summarizes text concisely."
          },
          {
            role: "user",
            content: `Please summarize the following text in a concise way:\n\n${extractedText}`
          }
        ],
        temperature: 0.7,
        max_tokens: 1024,
        top_p: 0.95
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
        }
      }
    );

    // Log API usage
    console.log('Groq API Usage:', {
      promptTokens: response.data.usage.prompt_tokens,
      completionTokens: response.data.usage.completion_tokens,
      totalTokens: response.data.usage.total_tokens,
      totalTime: response.data.usage.total_time,
      queueTime: response.data.usage.queue_time
    });

    const summary = response.data.choices[0]?.message?.content;
    
    if (!summary) {
      throw new Error('No summary generated from the API');
    }

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({ 
      summary,
      usage: {
        promptTokens: response.data.usage.prompt_tokens,
        completionTokens: response.data.usage.completion_tokens,
        totalTokens: response.data.usage.total_tokens,
        processingTime: response.data.usage.total_time
      }
    });
  } catch (error) {
    console.error('Error details:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });

    // Clean up uploaded file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    if (error.response?.status === 401) {
      return res.status(401).json({ error: 'Invalid Groq API key' });
    }
    if (error.response?.data?.error) {
      return res.status(error.response.status).json({ error: error.response.data.error });
    }
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size too large. Maximum size is 5MB' });
    }
    if (error.message === 'Only PDF files are allowed!') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 