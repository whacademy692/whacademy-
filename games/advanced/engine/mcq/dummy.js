// Dummy question set for the lab page and tests. 24 questions: 8 Easy, 8 Medium, 8 Hard.
// Real content comes from the platform question banks through adapter.normalize().

let n = 0;
const Q = (tier, stem, options, correct, explanation, calc = false, subject = 'Mixed') =>
  ({ id: `dm-${tier}${String(++n).padStart(2, '0')}`, tier, stem, options, correct, explanation, calc, subject });

export const DUMMY_RAW = [
  Q('E', 'Which planet is known as the Red Planet?', ['Venus', 'Mars', 'Jupiter', 'Mercury'], 1, 'Mars looks red because its soil is rich in iron oxide (rust).'),
  Q('E', 'How many sides does a hexagon have?', ['5', '6', '7', '8'], 1, 'Hex means six, so a hexagon has six sides.'),
  Q('E', 'What is 7 × 8?', ['54', '56', '48', '64'], 1, '7 × 8 = 56.', true),
  Q('E', 'What is the chemical formula of water?', ['CO2', 'H2O', 'O2', 'NaCl'], 1, 'One oxygen atom bonded to two hydrogen atoms: H2O.'),
  Q('E', 'Which gas do plants take in for photosynthesis?', ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Hydrogen'], 2, 'Plants use carbon dioxide and water to make glucose and oxygen.'),
  Q('E', 'What is the SI unit of force?', ['Joule', 'Watt', 'Pascal', 'Newton'], 3, 'Force is measured in newtons (N).'),
  Q('E', 'What is the capital of Pakistan?', ['Karachi', 'Lahore', 'Islamabad', 'Peshawar'], 2, 'Islamabad has been the capital since the 1960s.'),
  Q('E', 'What is 15% of 200?', ['20', '25', '30', '35'], 2, '15/100 × 200 = 30.', true),

  Q('M', 'A car covers 120 m in 8 s at constant speed. What is its speed?', ['12 m/s', '15 m/s', '18 m/s', '960 m/s'], 1, 'Speed = distance / time = 120 / 8 = 15 m/s.', true, 'Physics'),
  Q('M', 'Solve for x: 3x + 5 = 20', ['x = 3', 'x = 4', 'x = 5', 'x = 8'], 2, 'Subtract 5 from both sides: 3x = 15, so x = 5.', true, 'Math'),
  Q('M', 'Which organelle is the main site of aerobic respiration?', ['Nucleus', 'Mitochondrion', 'Ribosome', 'Golgi body'], 1, 'Mitochondria release most of the cell\'s ATP.', false, 'Biology'),
  Q('M', 'What is the pH of a neutral solution at 25 °C?', ['0', '1', '7', '14'], 2, 'Pure water has equal H+ and OH- ions, giving pH 7.', false, 'Chemistry'),
  Q('M', 'Which law is expressed as F = ma?', ['Newton\'s first law', 'Newton\'s second law', 'Newton\'s third law', 'Law of gravitation'], 1, 'Net force equals mass times acceleration.', false, 'Physics'),
  Q('M', 'Area of a circle of radius 7 cm (use π = 22/7)?', ['44 cm²', '49 cm²', '154 cm²', '308 cm²'], 2, 'A = πr² = 22/7 × 49 = 154 cm².', true, 'Math'),
  Q('M', 'What is the atomic number of carbon?', ['4', '6', '8', '12'], 1, 'Carbon has 6 protons, so its atomic number is 6.', false, 'Chemistry'),
  Q('M', 'Which of these is a vector quantity?', ['Mass', 'Speed', 'Velocity', 'Time'], 2, 'Velocity has both magnitude and direction.', false, 'Physics'),

  Q('H', 'What is d/dx of x³?', ['x²', '3x²', '3x', 'x³/3'], 1, 'Power rule: bring down the 3 and reduce the power by one.', false, 'Math'),
  Q('H', 'Kinetic energy of a 2 kg body moving at 6 m/s?', ['12 J', '18 J', '36 J', '72 J'], 2, 'KE = ½mv² = ½ × 2 × 36 = 36 J.', true, 'Physics'),
  Q('H', 'What is the hybridisation of carbon in methane?', ['sp', 'sp²', 'sp³', 'dsp²'], 2, 'Four sigma bonds around carbon need four sp³ orbitals.', false, 'Chemistry'),
  Q('H', 'Sum of the interior angles of a decagon (10 sides)?', ['1080°', '1260°', '1440°', '1800°'], 2, '(n − 2) × 180° = 8 × 180° = 1440°.', true, 'Math'),
  Q('H', 'How many moles are in 36 g of water (M = 18 g/mol)?', ['0.5', '1', '2', '4'], 2, 'n = mass / molar mass = 36 / 18 = 2 mol.', true, 'Chemistry'),
  Q('H', 'Which electromagnetic waves have the longest wavelength?', ['Gamma rays', 'X-rays', 'Visible light', 'Radio waves'], 3, 'Radio waves have the longest wavelength and lowest frequency.', false, 'Physics'),
  Q('H', 'What are the roots of x² − 5x + 6 = 0?', ['1 and 6', '2 and 3', '−2 and −3', '−1 and 6'], 1, 'Factorise: (x − 2)(x − 3) = 0.', true, 'Math'),
  Q('H', 'Two 6 Ω resistors are connected in parallel. Equivalent resistance?', ['12 Ω', '6 Ω', '3 Ω', '1.5 Ω'], 2, '1/R = 1/6 + 1/6 = 1/3, so R = 3 Ω.', true, 'Physics'),
];
