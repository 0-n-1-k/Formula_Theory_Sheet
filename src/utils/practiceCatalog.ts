import { CourseCode } from './storageSafety';

export interface PracticeSubModule {
  id: string;
  course: Exclude<CourseCode, 'ALL' | 'GEN'>;
  courseBadge: string;
  title: string;
  subtitle: string;
  topics: string[];
  pdfUrl: string | null;
}

export interface CoursePracticeGroup {
  course: Exclude<CourseCode, 'ALL' | 'GEN'>;
  badge: string;
  courseTitle: string;
  modules: PracticeSubModule[];
}

export const PRACTICE_CATALOG: readonly CoursePracticeGroup[] = [
  {
    course: 'M159',
    badge: 'MATH 159',
    courseTitle: 'Complex Variables & Vector Calculus',
    modules: [
      {
        id: 'm159-complex',
        course: 'M159',
        courseBadge: 'MATH 159',
        title: 'Complex Variables',
        subtitle: 'Cauchy–Riemann, Contour Integration, Laurent Series, Residue Theorem & Bilinear Maps',
        topics: [
          'Analytic Functions & Harmonic Conjugates',
          'Cauchy Integral Formula & Higher Derivatives',
          'Taylor / Laurent Series & Singularity Classification',
          'Residue Theorem & Real Improper / Trig Integrals',
        ],
        pdfUrl: null,
      },
      {
        id: 'm159-vector',
        course: 'M159',
        courseBadge: 'MATH 159',
        title: 'Vector Calculus',
        subtitle: 'Frenet–Serret Frame, Gradient/Divergence/Curl, Green’s, Stokes’ & Gauss Divergence Theorems',
        topics: [
          'Space Curves, Curvature & Torsion (Frenet–Serret)',
          'Directional Derivatives, Conservative Fields & Potentials',
          'Line & Surface Integrals in Cartesian/Cylindrical/Spherical Coords',
          'Green’s, Stokes’ & Gauss Divergence Theorem Term Finals',
        ],
        pdfUrl: null,
      },
    ],
  },
  {
    course: 'PHY',
    badge: 'PHY 121',
    courseTitle: 'Waves & Oscillations, Optics & Thermal Physics',
    modules: [
      {
        id: 'phy-waves',
        course: 'PHY',
        courseBadge: 'PHY 121',
        title: 'Waves & Oscillation',
        subtitle: 'SHM, Compound/Torsional Pendulums, Damped/Forced Oscillations, Progressive Waves & Reverberation',
        topics: [
          'Differential Equation of SHM & Lissajous Figures',
          'Bar / Compound Pendulum & Minimum Time Period',
          'Damped, Forced & Resonance Power Absorption',
          'Progressive / Standing Waves, Phase vs. Group Velocity & Sabine’s Law',
        ],
        pdfUrl: null,
      },
      {
        id: 'phy-optics',
        course: 'PHY',
        courseBadge: 'PHY 121',
        title: 'Optics',
        subtitle: 'Aberrations, Thick Lenses, Interference (Newton’s Rings), Single/Double-Slit Diffraction & Polarization',
        topics: [
          'Cardinal Points, Nodal Slide & Achromatic Doublets',
          'Thin-Film Interference, Wedge Films & Newton’s Rings',
          'Fraunhofer Single/Double-Slit & Grating Resolving/Dispersive Power',
          'Brewster’s Law, Malus’s Law, Waveplates & Laurent Half-Shade Polarimeter',
        ],
        pdfUrl: null,
      },
      {
        id: 'phy-thermal',
        course: 'PHY',
        courseBadge: 'PHY 121',
        title: 'Thermal Physics',
        subtitle: 'Kinetic Theory, Maxwell–Boltzmann Speeds, Mean Free Path, Carnot/Otto/Diesel Cycles & Maxwell Relations',
        topics: [
          'Maxwell Speed Distribution, Equipartition & Van der Waals Constants',
          'Adiabatic / Polytropic Processes, Carnot, Otto & Diesel Efficiencies',
          'Clausius Inequality, Entropy of Mixing & T-S Diagrams',
          'Thermodynamic Potentials (U, H, F, G), Maxwell Relations & Clausius–Clapeyron',
        ],
        pdfUrl: null,
      },
    ],
  },
  {
    course: 'EEE',
    badge: 'EEE 101',
    courseTitle: 'Electrical Circuits I (DC, Transients, Magnetics & AC)',
    modules: [
      {
        id: 'eee-dc',
        course: 'EEE',
        courseBadge: 'EEE 101',
        title: 'DC Circuits & Theorems',
        subtitle: 'Nodal/Mesh with Supernodes & Supermeshes, Y–Δ, Superposition, Thévenin/Norton & Maximum Power Transfer',
        topics: [
          'KCL/KVL, Wye–Delta (Y–Δ) Bridges & Infinite Ladders',
          'Nodal & Mesh Analysis with Dependent Sources',
          'Thévenin, Norton (Negative R_th Test-Source) & Maximum Power Transfer',
          'Superposition, Source Transformation, Millman’s & Reciprocity Theorems',
        ],
        pdfUrl: null,
      },
      {
        id: 'eee-trans-mag',
        course: 'EEE',
        courseBadge: 'EEE 101',
        title: 'Transients & Magnetics',
        subtitle: 'First-Order RC/RL Switching, Second-Order Series/Parallel RLC & Magnetic Circuits with Air-Gap Reluctance',
        topics: [
          'Continuity of v_C(0+) & i_L(0+) and First-Order Step/Pulse Responses',
          'Second-Order RLC Overdamped, Critically Damped & Underdamped Transients',
          'Ampère’s Circuit Law, Series-Parallel Reluctance & Air-Gap Fringing',
          ' Faraday/Lenz Law, B-H Hysteresis/Eddy Losses & Magnetic Pull Force',
        ],
        pdfUrl: null,
      },
      {
        id: 'eee-ac',
        course: 'EEE',
        courseBadge: 'EEE 101',
        title: 'AC Steady-State',
        subtitle: 'RMS/Average Waveform Calculus, Phasor Nodal/Mesh/Theorems, Complex Power Triangle, PFC & Resonance',
        topics: [
          'True RMS, Average Value, Form Factor & Crest Factor of Piecewise Waves',
          'Phasor Domain Nodal, Mesh, Superposition (Multi-Frequency) & Z_L = Z_th*',
          'Instantaneous/Complex Power S = P + jQ, Power Triangle & Capacitor PFC',
          'Series/Parallel Resonance, Half-Power Bandwidth & Two-Wattmeter Method',
        ],
        pdfUrl: null,
      },
    ],
  },
  {
    course: 'M157',
    badge: 'MATH 157',
    courseTitle: 'Calculus I (Differential & Integral Calculus)',
    modules: [
      {
        id: 'm157-diff',
        course: 'M157',
        courseBadge: 'MATH 157',
        title: 'Differential Calculus',
        subtitle: 'Continuity/Differentiability, Leibnitz’s Rule, Rolle’s/MVT/Taylor’s Theorems, Maxima/Minima & Curvature',
        topics: [
          'Piecewise Continuity, Differentiability & L’Hôpital Indeterminate Forms',
          'Successive Differentiation, Leibnitz’s Theorem & Maclaurin ODE Recurrence',
          'Rolle’s, Lagrange’s MVT, Cauchy’s MVT & Euler’s Homogeneous Theorem',
          'Lagrange Multipliers, Envelopes, Asymptotes & Radius of Curvature',
        ],
        pdfUrl: null,
      },
      {
        id: 'm157-int',
        course: 'M157',
        courseBadge: 'MATH 157',
        title: 'Integral Calculus',
        subtitle: 'Reduction Formulas, King’s Property Definite Integrals, Walli’s, Beta/Gamma Functions, Area & Volume',
        topics: [
          'Trigonometric & Algebraic Reduction Formulas',
          'Definite Integrals via King’s Property, Limit of a Sum & DUIS',
          'Beta & Gamma Functions, Duplication Formula & Improper Integrals',
          'Arc Length, Surface Area & Volume of Revolution (Cartesian/Polar/Parametric)',
        ],
        pdfUrl: null,
      },
    ],
  },
  {
    course: 'CSE',
    badge: 'CSE 109',
    courseTitle: 'Computer Programming (C & Object-Oriented C++)',
    modules: [
      {
        id: 'cse-c',
        course: 'CSE',
        courseBadge: 'CSE 109',
        title: 'C Programming',
        subtitle: 'Bitwise Operators, Pointers & 2D Dynamic Allocation, String/Array Manipulation, Structs/Unions & File I/O',
        topics: [
          'Operator Precedence, Short-Circuit Evaluation & Bitwise Masking',
          'Pointer Arithmetic, Function Pointers & Dynamic 2D malloc/realloc/free',
          'Recursion, Struct Padding vs. Unions & Self-Referential Linked Lists',
          'Formatted/Binary File I/O (fopen, fread, fwrite, fseek) & Preprocessor Macros',
        ],
        pdfUrl: null,
      },
      {
        id: 'cse-cpp',
        course: 'CSE',
        courseBadge: 'CSE 109',
        title: 'Object-Oriented C++',
        subtitle: 'Constructors/Destructors, Deep Copy, Operator Overloading, Virtual Polymorphism, Templates & STL',
        topics: [
          'Rule of Three (Copy Constructor, Copy Assignment, Destructor) & Friend Functions',
          'Unary/Binary/Stream Operator Overloading (<<, >>, ++, [])',
          'Multiple Inheritance, Diamond Virtual Base Classes & vtable/vptr Dispatch',
          'Function/Class Templates, Exception Handling (try/catch/throw) & STL Containers',
        ],
        pdfUrl: null,
      },
    ],
  },
];

export function getPracticeModulesForCourse(course: CourseCode): PracticeSubModule[] {
  if (course === 'ALL' || course === 'GEN') {
    return PRACTICE_CATALOG.flatMap((group) => group.modules);
  }
  const found = PRACTICE_CATALOG.find((group) => group.course === course);
  return found ? found.modules : PRACTICE_CATALOG.flatMap((group) => group.modules);
}
