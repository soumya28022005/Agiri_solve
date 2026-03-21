const { GoogleGenerativeAI } = require('@google/generative-ai');
const pool = require('../config/database');
const fs = require('fs');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const DISEASE_TREATMENTS = {
  'bacterial blight': {
    treatment: 'Remove infected leaves. Apply Copper Oxychloride 50% WP at 3g/L. Improve field drainage.',
    medicine: 'Copper Oxychloride (Blitox), Streptomycin',
    medicine_cost: '₹150-300 per acre',
    organic: 'Spray neem oil solution (3ml/L) + garlic extract'
  },
  'leaf spot': {
    treatment: 'Apply Mancozeb 75% WP at 2.5g/L or Carbendazim 50% WP at 1g/L. Remove infected leaves.',
    medicine: 'Mancozeb (Dithane M-45), Carbendazim (Bavistin)',
    medicine_cost: '₹120-250 per acre',
    organic: 'Spray Bordeaux mixture or trichoderma solution'
  },
  'rust': {
    treatment: 'Apply Propiconazole 25% EC at 1ml/L. Early morning application preferred.',
    medicine: 'Propiconazole (Tilt), Hexaconazole (Contaf)',
    medicine_cost: '₹200-400 per acre',
    organic: 'Sulfur dust application'
  },
  'powdery mildew': {
    treatment: 'Apply Wettable Sulphur 80% WP at 3g/L. Avoid overhead irrigation.',
    medicine: 'Sulphur WP (Sulfex), Triadimefon (Bayleton)',
    medicine_cost: '₹100-200 per acre',
    organic: 'Baking soda spray (5g/L)'
  },
  'blight': {
    treatment: 'Apply Metalaxyl + Mancozeb at 2.5g/L preventively. Remove infected parts.',
    medicine: 'Ridomil Gold MZ, Curzate M8',
    medicine_cost: '₹350-600 per acre',
    organic: 'Copper hydroxide spray'
  },
  'healthy': {
    treatment: 'Plant looks healthy! Continue regular monitoring.',
    medicine: 'No treatment needed',
    medicine_cost: '₹0',
    organic: 'Maintain good agricultural practices'
  }
};

function getDefaultTreatment(diseaseName) {
  const name = diseaseName.toLowerCase();
  for (const [key, value] of Object.entries(DISEASE_TREATMENTS)) {
    if (name.includes(key)) return value;
  }
  return {
    treatment: 'Consult your local KVK (Krishi Vigyan Kendra). Isolate affected plants immediately.',
    medicine: 'Consult expert for specific recommendation',
    medicine_cost: 'Variable - ₹100-500 per acre',
    organic: 'Remove affected leaves and maintain proper spacing'
  };
}

const detectDisease = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload a crop image' });
    }

    const cropName = req.body.crop_name || 'unknown crop';
    const imageData = fs.readFileSync(req.file.path);
    const base64Image = imageData.toString('base64');
    const mimeType = req.file.mimetype || 'image/jpeg';

    let diseaseResult;

    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });

      const prompt = `You are an expert agricultural plant pathologist AI.

Analyze this crop leaf image carefully and provide:

1. DISEASE NAME: (exact disease name or "Healthy Plant")
2. CONFIDENCE: (percentage 0-100)
3. IS HEALTHY: (yes or no)
4. SYMPTOMS: (what you see in the image - 1-2 sentences)
5. CAUSE: (fungal/bacterial/viral/pest/nutrient deficiency)
6. TREATMENT: (specific treatment steps in simple language)
7. MEDICINE: (specific medicine names available in India)
8. MEDICINE COST: (approximate cost in Indian Rupees per acre)
9. ORGANIC TREATMENT: (organic/natural alternative)
10. PREVENTION: (how to prevent this in future)

Crop type: ${cropName}

Respond in this EXACT format:
DISEASE: [name]
CONFIDENCE: [number]
HEALTHY: [yes/no]
SYMPTOMS: [description]
CAUSE: [type]
TREATMENT: [steps]
MEDICINE: [names]
COST: [amount]
ORGANIC: [method]
PREVENTION: [tips]`;

      const result = await model.generateContent([
        prompt,
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Image
          }
        }
      ]);

      const responseText = result.response.text();

      // Parse the response
      const lines = responseText.split('\n');
      const getValue = (key) => {
        const line = lines.find(l => l.startsWith(key + ':'));
        return line ? line.replace(key + ':', '').trim() : '';
      };

      const diseaseName = getValue('DISEASE') || 'Unknown Disease';
      const confidence = parseInt(getValue('CONFIDENCE')) || 75;
      const isHealthy = getValue('HEALTHY').toLowerCase() === 'yes';
      const treatment = getDefaultTreatment(diseaseName);

      diseaseResult = {
        disease_name: diseaseName,
        confidence: confidence,
        is_healthy: isHealthy,
        symptoms: getValue('SYMPTOMS') || 'See image analysis',
        cause: getValue('CAUSE') || 'Unknown',
        treatment: getValue('TREATMENT') || treatment.treatment,
        medicine: getValue('MEDICINE') || treatment.medicine,
        medicine_cost: getValue('COST') || treatment.medicine_cost,
        organic_treatment: getValue('ORGANIC') || treatment.organic,
        prevention: getValue('PREVENTION') || 'Maintain good field hygiene',
        source: 'Gemini Vision AI'
      };

    } catch (aiErr) {
      console.error('Gemini Vision error:', aiErr.message);

      // Fallback to rule-based
      diseaseResult = {
        disease_name: 'Analysis Failed - Please retry',
        confidence: 0,
        is_healthy: false,
        treatment: 'Please retake the photo in good lighting and try again.',
        medicine: 'Consult local KVK',
        medicine_cost: 'Variable',
        organic_treatment: 'Remove visibly affected leaves',
        source: 'Error: ' + aiErr.message
      };
    }

    // Clean up uploaded file
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    // Log to database
    if (req.user) {
      await pool.query(
        'INSERT INTO disease_logs (user_id, crop_name, disease_detected, confidence, treatment) VALUES ($1, $2, $3, $4, $5)',
        [req.user.userId, cropName, diseaseResult.disease_name, diseaseResult.confidence, diseaseResult.treatment]
      );
    }

    res.json({
      success: true,
      result: diseaseResult,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('Disease detection error:', err);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ success: false, message: 'Error during disease detection: ' + err.message });
  }
};

module.exports = { detectDisease };