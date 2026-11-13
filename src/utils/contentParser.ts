import type { FormulaCardRecord } from './formulaSearch';
import { decodeHtmlEntities } from './mathParser';
import type { CourseCode } from './storageSafety';
import { cleanCardTitle, extractValidExamTag } from './titleCleaner';

export interface TopicSectionRecord {
  id: string;
  course: CourseCode;
  title: string;
  freqBadge?: string;
  isOpenByDefault: boolean;
  cards: FormulaCardRecord[];
}

export interface NavLinkRecord {
  href: string;
  targetId: string;
  label: string;
}

export interface NavCourseGroupRecord {
  course: CourseCode;
  badgeText: string;
  links: NavLinkRecord[];
}

export interface ParsedNavContent {
  navF: NavCourseGroupRecord[];
  navT: NavCourseGroupRecord[];
}

/**
 * Curated variable/parameter explanations and practical/exam applications for cards
 * whose original HTML either had no `.fmw`/`.fmu` or only cited a PDF/revision-guide section number.
 */
const CURATED_CONTEXT_FALLBACKS: Record<
  string,
  { bodyText?: string; useText?: string }
> = {
  'eee-basic:8': {
    bodyText:
      '$R_{\\text{ammeter}} = 0\\,\\Omega$ (ideal short circuit in series); $R_{\\text{voltmeter}} = \\infty\\,\\Omega$ (ideal open circuit in parallel). Real DMMs use a $10\\text{ M}\\Omega$ input divider for voltage and a low-$\\text{m}\\Omega$ manganin shunt for current.',
    useText:
      'Redraw the circuit first by replacing ideal ammeters with a short wire and removing ideal voltmeters as open terminals; solve node voltages, then read $V = V_+ - V_-$ across the open voltmeter nodes.',
  },
  'eee-delta:5': {
    bodyText:
      '$R_{\\text{eq}} = V_T / I_T$ across terminal pair $(a, b)$ with all internal independent sources deactivated ($V_s \\to$ short, $I_s \\to$ open). Bridge balance holds when opposite arm products match ($R_1 R_4 = R_2 R_3$).',
    useText:
      'Used in Wheatstone bridge strain gauges and RTD temperature sensors. In exams, always check symmetry or bridge balance before applying $\\Delta\\text{--}Y$ conversion to save 3–4 algebra steps.',
  },
  'eee-trans:8': {
    bodyText:
      '$t_1, t_2$ = sequential switching instants; capacitor voltage $v_C(t_k^+) = v_C(t_k^-)$ (stored electric field energy $\\frac{1}{2}Cv^2$) and inductor current $i_L(t_k^+) = i_L(t_k^-)$ (magnetic energy $\\frac{1}{2}Li^2$) cannot jump instantaneously.',
    useText:
      'Models multi-stage power-converter timing and relay reclosing. Solve interval $0 \\le t \\le t_1$ first, evaluate $x(t_1^-)$ numerically, and use it as the initial condition $x(t_1^+)$ for the next topology.',
  },
  'eee-mag:6': {
    bodyText:
      '$\\Phi = B A$ = magnetic flux ($\\text{Wb}$); $\\mathcal{F} = N I = \\sum H_k \\ell_k = \\Phi \\mathcal{R}_{\\text{eq}}$ = magnetomotive force ($\\text{A}\\cdot\\text{turns}$); $\\mathcal{R} = \\ell / (\\mu_0 \\mu_r A)$ = reluctance ($\\text{A}\\cdot\\text{turns/Wb}$).',
    useText:
      'Fun fact: Because air has $\\mu_r \\approx 1$ while silicon steel has $\\mu_r > 2000$, a tiny $1\\text{ mm}$ air gap often dominates $>80\\%$ of a transformer or motor core’s total reluctance and stores most of the magnetic energy.',
  },
  'eee-dual:2': {
    bodyText:
      'Topological duality swaps Series $\\leftrightarrow$ Parallel, $R \\leftrightarrow G$, $L \\leftrightarrow C$, $V_s \\leftrightarrow I_s$, and KVL mesh equations $\\leftrightarrow$ KCL nodal equations ($n$ meshes map to $n$ principal nodes plus reference).',
    useText:
      'Place one dot inside each mesh of the planar circuit and one reference dot outside; draw a dual element for every shared boundary. Note: Non-planar circuits (like the $K_{3,3}$ utility graph) have no topological dual.',
  },
  'cse-c:5': {
    bodyText:
      'Covers integer division truncation (<code>7 / 2 == 3</code>), negative modulo sign matching the dividend (<code>-7 % 2 == -1</code> in C99+), short-circuit evaluation (<code>&amp;&amp;</code>, <code>||</code>), and array-to-pointer decay.',
    useText:
      'High-yield checklist for 1-mark output tracing and spot-the-bug questions. Fun fact: In C, <code>a[i]</code> is literally rewritten by the compiler as <code>*(a + i)</code>, which makes <code>i[a]</code> legal (though cursed) C syntax.',
  },
  'cse-c:6': {
    bodyText:
      '<code>sizeof(char) = 1</code>, <code>int = 4</code>, <code>double = 8</code> bytes on LP64 Linux/GCC; usual arithmetic conversions promote <code>char</code>/<code>short</code> to <code>int</code> and mixed <code>int</code>/<code>double</code> operands to <code>double</code>.',
    useText:
      'Crucial trap: Bitwise operators <code>&amp;</code>, <code>^</code>, <code>|</code> have LOWER precedence than relational <code>==</code> and <code>!=</code> — so <code>x &amp; 1 == 0</code> parses as <code>x &amp; (1 == 0)</code>! Always parenthesize <code>(x &amp; 1) == 0</code>.',
  },
  'cse-c:7': {
    bodyText:
      '<code>%[flags][width][.precision]specifier</code> controls I/O formatting; <code>scanf("%lf", &amp;d)</code> requires <code>%lf</code> for <code>double</code> and <code>&amp;</code> for scalars, while <code>" %c"</code> skips leading whitespace/newlines.',
    useText:
      'Fun fact: <code>printf</code> returns the exact count of characters printed, and <code>scanf</code> returns the number of items successfully matched (or <code>EOF = -1</code>) — a classic trick used in nested <code>if (printf(...))</code> trace puzzles.',
  },
  'cse-c:8': {
    bodyText:
      'Catalogues 34 classic C/C++ pitfalls: assignment <code>=</code> inside <code>if (x = 0)</code>, unsequenced side effects (<code>i = i++</code>), dangling-else binding, missing <code>break</code> fallthrough, and off-by-one loop bounds.',
    useText:
      'Use when debugging segmentation faults or answering "Find and correct the errors" exam questions. Always verify: (1) local accumulators initialized to 0, (2) space reserved for <code>\'\\0\'</code>, and (3) no division by integer <code>1/2</code>.',
  },
  'cse-c:9': {
    bodyText:
      'Catalogues 34 classic C/C++ pitfalls: assignment <code>=</code> inside <code>if (x = 0)</code>, unsequenced side effects (<code>i = i++</code>), dangling-else binding, missing <code>break</code> fallthrough, and off-by-one loop bounds.',
    useText:
      'Use when debugging segmentation faults or answering "Find and correct the errors" exam questions. Always verify: (1) local accumulators initialized to 0, (2) space reserved for <code>\'\\0\'</code>, and (3) no division by integer <code>1/2</code>.',
  },
  'cse-lib:0': {
    bodyText:
      '<code>&lt;stdio.h&gt;</code> = buffered stream I/O; <code>&lt;stdlib.h&gt;</code> = heap allocation (<code>malloc</code>/<code>free</code>), numeric conversion &amp; <code>qsort</code>; <code>&lt;string.h&gt;</code> = <code>\'\\0\'</code>-terminated &amp; raw byte ops; <code>&lt;ctype.h&gt;</code> = char classification; <code>&lt;math.h&gt;</code> = IEEE-754 floating-point math.',
    useText:
      'Include the exact header matching library calls in full-program exam solutions, and remember that all <code>&lt;math.h&gt;</code> trigonometric functions operate in radians ($\\pi = \\arccos(-1.0)$) rather than degrees.',
  },
  'cse-lib:1': {
    bodyText:
      '<code>s</code>, <code>d</code> = null-terminated <code>char*</code> strings; <code>n</code> = byte count; <code>math.h</code> functions take/return <code>double</code>. Note: <code>strlen(s)</code> excludes <code>\'\\0\'</code>, whereas <code>sizeof("abc") == 4</code> includes it.',
    useText:
      'Fun fact: <code>strcmp(a, b)</code> returns the ASCII difference of the first mismatching unsigned characters (negative if <code>a &lt; b</code>, <code>0</code> if equal, positive if <code>a &gt; b</code>) — never assume it only returns <code>-1, 0, +1</code>.',
  },
  'cse-ptr:7': {
    bodyText:
      '<code>p + k</code> advances address by <code>k * sizeof(*p)</code> bytes; in row-major 2D array <code>a[R][C]</code>, <code>*(*(a + i) + j)</code> accesses element <code>(i, j)</code> at byte offset <code>(i * C + j) * sizeof(T)</code>.',
    useText:
      'Exam favorite: Convert any <code>a[i][j]</code> or <code>a[i][j][k]</code> expression into pure pointer dereferences without brackets, and always free dynamically allocated 2D arrays in reverse order (rows first, then row-pointer array).',
  },
  'cse-str:8': {
    bodyText:
      '<code>a[n]</code> = contiguous 1D array of $n$ elements (indices $0 \\dots n-1$); <code>m[R][C]</code> = row-major 2D matrix where main diagonal satisfies $i = j$ and secondary (anti-)diagonal satisfies $i + j = n - 1$.',
    useText:
      'Covers Bubble/Selection/Insertion sort ($O(n^2)$), Binary Search ($O(\\log n)$ on sorted arrays), and in-place reversal. Fun fact: Writing <code>mid = L + (R - L) / 2</code> instead of <code>(L + R) / 2</code> prevents 32-bit signed integer overflow.',
  },
  'cse-str:9': {
    bodyText:
      '<code>s</code>, <code>d</code>, <code>t</code> = null-terminated C strings ending at sentinel byte <code>\'\\0\'</code> (ASCII 0); two-pointer in-place algorithms scan inward from <code>i = 0</code> and <code>j = len - 1</code> in $O(n)$ time and $O(1)$ extra space.',
    useText:
      'BUET exams frequently forbid <code>&lt;string.h&gt;</code> and require writing <code>myStrlen</code>, <code>myStrcpy</code>, <code>myStrcat</code>, <code>myStrcmp</code>, or <code>myStrstr</code> from scratch using pointer idiomatic loops like <code>while ((*d++ = *s++));</code>.',
  },
  'cse-file:8': {
    bodyText:
      '<code>struct</code> size = sum of members + alignment padding; <code>union</code> overlays all members at byte offset 0 (size = largest member); <code>FILE *fp</code> tracks stream buffer, file position indicator, and EOF/error flags.',
    useText:
      'Real-life &amp; exam use: Unions allow inspecting raw IEEE-754 float bits or hardware registers; in File I/O problems, always check <code>if (!fp) return 1;</code> and prefer <code>while (fscanf(fp, ...) == K)</code> over <code>!feof(fp)</code> to avoid reading the last record twice.',
  },
  'cse-bit:5': {
    bodyText:
      '<code>x</code> = integer operand; <code>k</code> = 0-indexed bit position from LSB ($0 \\le k < 31$); masks use unsigned <code>1U &lt;&lt; k</code> to avoid signed overflow undefined behavior when shifting into bit 31.',
    useText:
      'Used in embedded microcontroller register control, network subnet masks, and cryptography. Master the 4 core mask idioms: Set <code>x |= (1U&lt;&lt;k)</code>, Clear <code>x &amp;= ~(1U&lt;&lt;k)</code>, Toggle <code>x ^= (1U&lt;&lt;k)</code>, Test <code>(x &gt;&gt; k) &amp; 1U</code>.',
  },
  'cse-bit:6': {
    bodyText:
      'Brian Kernighan’s trick <code>x &amp; (x - 1)</code> clears the lowest set bit in $O(1)$; <code>x &amp; -x</code> isolates the lowest set bit; circular bit rotation combines <code>(x &lt;&lt; k) | (x &gt;&gt; (W - k))</code> on unsigned width $W$.',
    useText:
      'Fun fact: <code>x &gt; 0 &amp;&amp; (x &amp; (x - 1)) == 0</code> tests if $x$ is an exact power of 2 in a single CPU clock cycle without loops — a staple of BUET CSE 109 bitwise function questions.',
  },
  'cse-num:1': {
    bodyText:
      'In $N$-bit two’s complement, weights are $-2^{N-1}$ for the MSB ($b_{N-1}$) and $+2^k$ for bits $0 \\le k \\le N-2$, spanning $[-2^{N-1},\\, 2^{N-1}-1]$ with a single representation of zero.',
    useText:
      'Why every modern CPU uses Two’s Complement: the exact same hardware adder circuit adds positive and negative numbers without separate sign logic! Trap: Negating $T_{\\min} = -2^{N-1}$ overflows back to $T_{\\min}$ because $+2^{N-1}$ cannot be represented.',
  },
  'cse-algo:6': {
    bodyText:
      'Each recursive call pushes a stack frame containing parameters, local variables, and return address; requires a terminating base case and a state transition strictly approaching the base case.',
    useText:
      'To trace recursive output in exams, draw the recursion tree (especially for dual-branch calls like Fibonacci or Towers of Hanoi) and note whether <code>printf</code> occurs pre-order (before call) or post-order (during unwinding).',
  },
  'cse-pat:5': {
    bodyText:
      '<code>n</code> = total rows; outer loop index <code>i</code> ($1 \\le i \\le n$) tracks the row, while inner loops control leading spaces ($n - i$) and symbol count ($2i - 1$ for centered pyramids, $i$ for triangles).',
    useText:
      'Universal 3-step exam method for any ASCII/number pattern: (1) count rows, (2) express leading spaces as a linear function of row <code>i</code>, and (3) express the increasing/decreasing character sequence per column <code>j</code>.',
  },
  'cse-cpp:7': {
    bodyText:
      '<code>this</code> = implicit pointer to invoking object; Rule of Three requires custom Destructor <code>~T()</code>, Copy Constructor <code>T(const T&amp;)</code>, and Copy Assignment <code>operator=</code> whenever a class manages raw heap pointers.',
    useText:
      'Without a deep copy constructor, passing a heap-owning object by value causes a shallow-copy double-<code>delete</code> crash when the temporary goes out of scope. Mark base destructors <code>virtual</code> whenever polymorphism is used.',
  },
  't-cse1:3': {
    bodyText:
      'Compares storage classes: <code>auto</code> (stack, block scope, garbage initial value), <code>static</code> (data/BSS segment, retains value across calls, zero-initialized), <code>extern</code> (global linkage), and <code>register</code>.',
    useText:
      'Frequent part-(a) theory question: contrast <code>struct</code> vs. <code>union</code> memory layout, call-by-value vs. call-by-reference (via pointers in C), and why macro <code>#define SQR(x) ((x)*(x))</code> needs parentheses around every argument.',
  },
  't-cse1:4': {
    bodyText:
      'Summarizes 28 deterministic output-tracing rules: post-increment vs. pre-increment return values, short-circuit <code>&amp;&amp;</code>/<code>||</code> skipping right-hand side effects, <code>sizeof</code> unevaluated operands, and pointer stride.',
    useText:
      'Fun fact: Inside <code>sizeof(i++)</code>, the expression <code>i++</code> is NEVER evaluated at runtime because <code>sizeof</code> is resolved at compile time from the operand’s type — so <code>i</code> remains unchanged!',
  },
  't-cse2:2': {
    bodyText:
      'Covers the C++ Rule of Three, forward declaration for a <code>friend</code> function bridging two classes (<code>class B;</code>), and member vs. non-member <code>friend</code> operator overloading (<code>operator+</code>, <code>operator&lt;&lt;</code>).',
    useText:
      'Exam rule of thumb: Overload binary <code>op</code> as a member when the left operand is the class itself (<code>a + b</code>), but as a <code>friend</code> non-member when the left operand is a primitive or stream (<code>10 + a</code> or <code>cout &lt;&lt; a</code>).',
  },
  't-cse2:3': {
    bodyText:
      'Contrasts C++ references (<code>T &amp;r = x</code>, non-null alias bound at initialization) with pointers (<code>T *p</code>, nullable, reseatable), and <code>new</code>/<code>delete</code> (type-safe, calls ctor/dtor) with <code>malloc</code>/<code>free</code> (raw uninitialized bytes).',
    useText:
      'Explains function-overloading ambiguity (e.g., passing <code>0</code> or <code>float</code> when both <code>f(int)</code> and <code>f(double)</code> exist, or default arguments overlapping with a fewer-parameter overload).',
  },
  't-m1592:7': {
    bodyText:
      '$u(x,y)$ is harmonic if $\\nabla^2 u = u_{xx} + u_{yy} = 0$; $v(x,y)$ is its harmonic conjugate if $f(z) = u + iv$ is analytic, satisfying the Cauchy–Riemann equations $u_x = v_y$ and $u_y = -v_x$.',
    useText:
      'Real-life &amp; exam application: Level curves $u(x,y)=c_1$ and $v(x,y)=c_2$ form orthogonal families representing electrostatic equipotential lines and electric field lines! Use Milne–Thomson $f\'(z) = u_x(z,0) - i u_y(z,0)$ for fast reconstruction.',
  },
};

function extractSymbolDescriptionsFromCard(
  rawLatex: string,
  codeContent: string | undefined,
  course: CourseCode
): string {
  const notes: string[] = [];
  const src = `${rawLatex || ''} ${codeContent || ''}`;

  if (course === 'EEE') {
    if (/V_\{?(?:th|TH)\}?|R_\{?(?:th|TH)\}?/.test(src)) {
      notes.push('$V_{\\text{th}}$ = open-circuit Thévenin voltage; $R_{\\text{th}}$ = equivalent resistance seen from load terminals');
    }
    if (/I_N|R_N/.test(src)) {
      notes.push('$I_N = I_{\\text{sc}}$ = short-circuit Norton current; $R_N = R_{\\text{th}}$');
    }
    if (/\\tau\b/.test(src)) {
      notes.push('$\\tau$ = circuit time constant ($RC$ or $L/R$, time to decay by $e^{-1} \\approx 36.8\\%$)');
    }
    if (/\\omega\b/.test(src)) {
      notes.push('$\\omega = 2\\pi f$ = angular frequency ($\\text{rad/s}$)');
    }
    if (/\\cos\s*\\theta|\\text\{PF\}|P\s*=|Q\s*=|S\s*=/.test(src)) {
      notes.push('$P$ = real power ($\\text{W}$), $Q$ = reactive power ($\\text{VAR}$), $S = P + jQ$ = complex power ($\\text{VA}$)');
    }
    if (/\\Phi|\\mathcal\{R\}|\\mathcal\{F\}/.test(src)) {
      notes.push('$\\Phi$ = magnetic flux ($\\text{Wb}$), $\\mathcal{F} = NI$ = MMF ($\\text{A}\\cdot\\text{turns}$), $\\mathcal{R}$ = reluctance');
    }
  } else if (course === 'PHY') {
    if (/\\lambda\b/.test(src)) {
      notes.push('$\\lambda$ = wavelength ($\\text{m}$); optical path difference $\\Delta = \\mu \\cdot \\Delta x$');
    }
    if (/\\omega\b|T\s*=/.test(src)) {
      notes.push('$\\omega = 2\\pi / T$ = angular frequency ($\\text{rad/s}$); $A$ = oscillation amplitude');
    }
    if (/\\eta\b|T_H|T_C|T_1|T_2/.test(src)) {
      notes.push('$\\eta$ = thermal efficiency; $T_H, T_C$ = absolute reservoir temperatures in Kelvin ($\\text{K}$)');
    }
    if (/dS|\\Delta S|k_B/.test(src)) {
      notes.push('$S$ = entropy ($\\text{J/K}$); $R = 8.314\\,\\text{J/(mol}\\cdot\\text{K)}$ = universal gas constant');
    }
  } else if (course === 'M157' || course === 'M159') {
    if (/\\Gamma\b|B\s*\(/.test(src)) {
      notes.push('$\\Gamma(n) = \\int_0^\\infty x^{n-1}e^{-x}dx$ = Euler Gamma function; $B(m,n)$ = Beta integral');
    }
    if (/\\rho\b|\\kappa\b/.test(src)) {
      notes.push('$\\rho$ = radius of curvature; $\\kappa = 1/\\rho$ = curvature of the plane curve');
    }
    if (/y_n|D\^n/.test(src)) {
      notes.push('$y_n = d^n y / dx^n$ = $n$-th successive derivative; $(y_n)_0$ = value evaluated at $x = 0$');
    }
    if (/\\oint|\\operatorname\{Res\}|z_0/.test(src)) {
      notes.push('$z = x + iy \\in \\mathbb{C}$; $z_0$ = isolated pole/singularity inside contour $C$');
    }
    if (/\\frac\{\\partial|J\s*=/.test(src)) {
      notes.push('$\\partial f / \\partial x$ = partial derivative holding other variables constant; $J$ = Jacobian determinant');
    }
  } else if (course === 'CSE') {
    if (/malloc|calloc|realloc|free/.test(src)) {
      notes.push('<code>malloc</code>/<code>calloc</code> allocate heap bytes (returns <code>NULL</code> on failure); <code>free</code> releases heap memory');
    }
    if (/FILE\s*\*|fopen|fscanf|fprintf|fread|fwrite/.test(src)) {
      notes.push('<code>FILE *fp</code> = buffered file stream pointer; always close with <code>fclose(fp)</code> to flush buffers');
    }
    if (/<<|>>|\^|~|&/.test(src)) {
      notes.push('Bitwise operators act on binary representation; shift masks use unsigned <code>1U &lt;&lt; k</code>');
    }
    if (/class\s+\w+|virtual|operator/.test(src)) {
      notes.push('<code>this</code> points to the invoking instance; member methods enforce encapsulation &amp; RAII invariants');
    }
  }

  return notes.slice(0, 2).join('; ');
}

const TOPIC_STRATEGY_AND_FUN_FACTS: Record<string, { bodyFallback: string; useFallback: string }> = {
  'eee-basic': {
    bodyFallback: '$V$ = potential difference ($\\text{V}$), $I$ = branch current ($\\text{A}$), $P = VI$ = instantaneous power ($\\text{W}$) under passive sign convention ($I$ enters $+$ terminal).',
    useFallback: 'Real-world & exam use: Passive sign convention ($P > 0$ absorbs, $P < 0$ supplies) guarantees $\\sum P_{\\text{absorbed}} = \\sum P_{\\text{supplied}}$ across any closed power grid or PCB.',
  },
  'eee-delta': {
    bodyFallback: '$R_a, R_b, R_c$ = $\\Delta$-network branch resistances; $R_1, R_2, R_3$ = equivalent $Y$-network arm resistances connected to terminals $1, 2, 3$.',
    useFallback: 'Used in 3-phase power distribution and Wheatstone bridge sensors. Exam tip: If all three resistors are equal, $R_Y = R_\\Delta / 3$ (and $R_\\Delta = 3 R_Y$) instantaneously.',
  },
  'eee-nodal': {
    bodyFallback: '$v_k$ = node voltage with respect to reference ground ($0\\text{ V}$); $i_m$ = clockwise mesh current circulating around planar window $m$.',
    useFallback: 'Real-world SPICE circuit simulators (like PSpice and LTspice) use Modified Nodal Analysis (MNA) matrices because nodal equations scale automatically to non-planar IC layouts.',
  },
  'eee-thev': {
    bodyFallback: '$V_{\\text{th}} = V_{\\text{oc}}$ = open-circuit terminal voltage; $R_{\\text{th}} = V_{\\text{oc}} / I_{\\text{sc}}$ = equivalent resistance looking back into the linear bilateral network.',
    useFallback: 'Fun fact: Léon Charles Thévenin, a French telegraph engineer, published this theorem in 1883 (rediscovering Helmholtz’s 1853 result) to simplify long-distance telegraph line analysis.',
  },
  'eee-maxp': {
    bodyFallback: '$R_L$ (or $Z_L = R_L + jX_L$) = adjustable load impedance; maximum real power $P_{\\max} = V_{\\text{th}}^2 / (4R_{\\text{th}})$ occurs at $R_L = R_{\\text{th}}$ (or $Z_L = Z_{\\text{th}}^*$).',
    useFallback: 'Real-life distinction: RF antennas and audio amplifiers match $R_L = R_{\\text{th}}$ (50% efficiency) to maximize signal power, whereas utility power grids keep $R_{\\text{th}} \\ll R_L$ for $>95\\%$ efficiency!',
  },
  'eee-trans': {
    bodyFallback: '$x(t) = x(\\infty) + [x(0^+) - x(\\infty)]e^{-t/\\tau}$ for $t \\ge 0$, where $x(0^+)$ is enforced by continuity of $v_C$ and $i_L$ across switching.',
    useFallback: 'Governs RC/RL clock edges, camera flash discharge, and inductive flyback. In 5 time constants ($5\\tau$), a first-order transient reaches $1 - e^{-5} = 99.33\\%$ of its final steady state.',
  },
  'eee-ac': {
    bodyFallback: 'Phasor $\\mathbf{V} = V_m \\angle \\phi$ transforms linear differential equations into complex algebra with $\\frac{d}{dt} \\leftrightarrow j\\omega$, $Z_L = j\\omega L$, and $Z_C = -j/(\\omega C)$.',
    useFallback: 'Industrial plants add parallel capacitor banks for power-factor correction ($\\cos\\theta \\to 0.95+$) to eliminate reactive current penalties without changing real mechanical load power $P$.',
  },
  'eee-mag': {
    bodyFallback: 'Hopkinson’s Law $\\mathcal{F} = N I = \\Phi \\mathcal{R}$ mirrors Ohm’s Law $V = I R$, mapping flux $\\Phi \\leftrightarrow I$, MMF $NI \\leftrightarrow V$, and reluctance $\\mathcal{R} \\leftrightarrow R$.',
    useFallback: 'Used to design transformer cores, EV traction motors, and solenoid actuators. Always convert core lengths to meters ($\\text{m}$) and cross-sections to $\\text{m}^2$ before computing $\\mathcal{R} = \\ell/(\\mu A)$.',
  },
  'cse-c': {
    bodyFallback: 'Defines C99/C11 operator precedence, integer promotion, and deterministic control-flow execution on 64-bit GCC targets.',
    useFallback: 'When tracing exam code, track exact variable types (<code>int</code> vs. <code>double</code>), short-circuit boolean evaluation, and post-increment side-effect timing.',
  },
  'cse-lib': {
    bodyFallback: 'Standard C library functions operate on null-terminated <code>char*</code> buffers, <code>double</code> radians (<code>&lt;math.h&gt;</code>), and <code>void*</code> heap blocks (<code>&lt;stdlib.h&gt;</code>).',
    useFallback: 'Saves writing boilerplate in timed exams when <code>&lt;string.h&gt;</code>, <code>&lt;ctype.h&gt;</code>, or <code>&lt;stdlib.h&gt;</code> (<code>qsort</code>, <code>strtol</code>) is permitted by the question prompt.',
  },
  'cse-ptr': {
    bodyFallback: 'Pointer <code>T *p</code> stores a memory address; <code>p + i</code> scales by <code>i * sizeof(T)</code> bytes, and <code>*p</code> dereferences the target lvalue.',
    useFallback: 'Real-world systems use pointers for zero-copy buffer passing, dynamic matrices, and callback tables. Always pair every <code>malloc</code>/<code>calloc</code> with <code>free</code> and set freed pointers to <code>NULL</code>.',
  },
  'cse-str': {
    bodyFallback: 'C strings are contiguous <code>char</code> arrays terminated by sentinel <code>\'\\0\'</code> (ASCII 0); array size must be at least <code>strlen(s) + 1</code>.',
    useFallback: 'In BUET CSE 109 exams, check whether <code>&lt;string.h&gt;</code> is forbidden before calling <code>strlen</code>/<code>strcpy</code>, and always terminate manually constructed strings with <code>dst[k] = \'\\0\'</code>.',
  },
  'cse-file': {
    bodyFallback: '<code>struct</code> packs heterogeneous fields at aligned offsets; <code>FILE *fp</code> abstracts OS file descriptors with user-space read/write buffering.',
    useFallback: 'Used in binary database records, network packet headers, and configuration parsers. In binary file updates, <code>fseek(fp, idx * sizeof(Rec), SEEK_SET)</code> gives $O(1)$ random access.',
  },
  'cse-bit': {
    bodyFallback: 'Bitwise operators execute in 1 CPU cycle on 32/64-bit registers; bit positions are 0-indexed from the Least Significant Bit (LSB).',
    useFallback: 'Essential for hardware device drivers, pixel color packing (<code>0xAARRGGBB</code>), and cryptography. Always cast to <code>unsigned</code> before right-shifting bitmasks to guarantee zero-fill logical shift.',
  },
  'cse-num': {
    bodyFallback: 'Positional base-$b$ representation $\\sum d_k b^k$ and $N$-bit two’s complement encoding where MSB weight is $-2^{N-1}$.',
    useFallback: 'Fun fact: Two’s complement eliminated the $-0$ vs. $+0$ hardware bug of 1960s one’s-complement mainframes and unified addition and subtraction into a single ALU circuit.',
  },
  'cse-ds': {
    bodyFallback: 'Self-referential <code>struct Node { int data; struct Node *next; }</code> links heap-allocated nodes dynamically without contiguous memory reallocation.',
    useFallback: 'Allows $O(1)$ head/pointer insertion and deletion without shifting elements. In exam pointer-manipulation code, always update <code>newNode-&gt;next</code> BEFORE overwriting <code>head</code> or <code>prev-&gt;next</code>!',
  },
  'cse-algo': {
    bodyFallback: 'Characterizes time complexity $T(n)$ and call-stack space depth $S(n)$ across divide-and-conquer, dynamic, and recursive algorithms.',
    useFallback: 'Verify the base case (<code>n &lt;= 1</code> or <code>L &gt; R</code>) first when writing recursive exam functions, and watch out for exponential $O(2^n)$ overlap when recursion branches twice without memoization.',
  },
  'cse-pat': {
    bodyFallback: 'Row index <code>i</code> ($1 \\le i \\le n$) and column index <code>j</code> ($1 \\le j \\le 2n-1$) govern 2D coordinate symmetry in console pattern loops.',
    useFallback: 'Tip: Any diamond or hourglass pattern can be written concisely using Manhattan distance $|i - c| + |j - c| \\le r$ from the center coordinate $(c, c)$.',
  },
  'cse-cpp': {
    bodyFallback: 'Encapsulates state with <code>private</code> members, RAII constructors/destructors, operator overloading, and <code>virtual</code> table dynamic dispatch.',
    useFallback: 'In C++ exam questions, check whether a class allocates memory with <code>new[]</code> — if so, it MUST define a destructor <code>delete[]</code>, copy constructor, and <code>operator=</code> (Rule of Three).',
  },
};

/**
 * Strips leading `Where:`, `Conditions:`, `Use:`, or `Exam Application:` labels from `.fmw` / `.fmu` HTML.
 */
export function stripContextPrefix(html: string): string {
  if (!html) return '';
  return html
    .replace(
      /^\s*(?:<(?:b|strong)>\s*)?(?:Where|Conditions|Use|Exam Application)\s*:?\s*(?:<\/(?:b|strong)>\s*)?:?\s*/i,
      ''
    )
    .trim();
}

/**
 * Removes all mentions of uploaded PDF filenames, revision guides, lecture/class notes,
 * textbook author/chapter/section/problem numbers, and stray section citations from
 * `.fmw`, `.fmu`, and `.fmnote` strings while preserving real BUET exam-year references.
 */
export function sanitizeContextText(
  rawHtml: string | undefined,
  cardTitle: string,
  topicTitle: string,
  course?: string
): string {
  if (!rawHtml) return '';
  let text = stripContextPrefix(rawHtml);
  if (!text) return '';

  // Immediately clear pure CSE 109 Complete Revision Guide citations so rich curated fallbacks take over
  if (/CSE\s*109\s*Complete\s*Revision\s*Guide/i.test(text)) {
    return '';
  }

  // 1. Remove full clauses or sentences referencing revision guides, class/lecture notes, or handouts
  text = text.replace(
    /(?:^|(?<!\d)\.\s+|;\s*)(?:Directly\s+(?:covered|tested|asked)\s+in\s+|From\s+|In\s+|See\s+|Source\s*:\s*|Covered\s+in\s+)?(?:BUET\s+)?(?:CSE\s*10[19]|EEE\s*101|MATH\s*15[79]|PHY\s*121|PHY\s*165)?\s*(?:[A-Za-z\s&]+?\s+)?(?:Complete\s+)?(?:Revision\s+Guide|Lecture\s+Notes|Class\s+Notes|Study\s+Guide|Handout|Cheatsheet|Formula\s+Sheet)(?:[^.;]|\.\d)*(?:\.(?!\d)|;|$)/gi,
    ' '
  );

  // 2. Remove inline mentions of revision guides / lecture notes / class notes
  text = text.replace(
    /(?:from\s+|in\s+|see\s+|source:\s*|covered\s+in\s+)?(?:buet\s+)?(?:cse\s*10[19]|eee\s*101|math\s*15[79]|phy\s*121)?\s*(?:complete\s+)?(?:revision\s+guide|lecture\s+notes|class\s+notes|study\s+guide|handout|cheatsheet|formula\s+sheet)(?:\s*\([^)]*\))?\.?/gi,
    ''
  );

  // 3. Remove "Textbook Ref: ..." completely even when containing .h or &amp;
  text = text.replace(/Textbook\s+Ref\s*:\s*[\s\S]*$/gi, '');

  // 4. Remove parenthetical textbook / section / page / problem citations e.g. "(Sadiku Prob. 6.57)", "(pp. 7–9)", "(Sec. 4.1)"
  text = text.replace(
    /\(\s*(?:[^()]*\b(?:Sadiku|Boylestad|Alexander|Grewal|Kreyszig|Schaum(?:'s)?|Kernighan|Ritchie|Balagurusamy|Herbert\s+Schildt|Schildt|Sec(?:t|tion)?s?\.?|Ch(?:ap(?:ter)?)?\.?|pp\.?|Pages?|Lec(?:ture)?s?\.?|Slides?|Prob(?:lem)?s?\.?)\b[^()]*)\)/gi,
    ''
  );

  // 5. Remove inline textbook author + section/chapter/problem citations
  text = text.replace(
    /\b(?:Sadiku|Boylestad|Alexander|Grewal|Kreyszig|Schaum(?:'s)?|Kernighan(?:\s*&(?:amp;)?\s*Ritchie)?|Ritchie|Balagurusamy|Herbert\s+Schildt|Schildt)(?:\s*,\s*Teach\s+Yourself\s+C(?:\+\+)?)?(?:\s*\([^)]*\))?\s*(?:[,:]?\s*(?:Sec(?:t|tion)?s?\.?|Ch(?:ap(?:ter)?)?\.?|Prob(?:lem)?s?\.?|Ex(?:ample)?s?\.?)\s*\d+(?:\.\d+)*(?:\s*[–,-]\s*\d+(?:\.\d+)*)*)*/gi,
    ''
  );

  // 6. Remove standalone Section / Chapter / Page number references
  text = text.replace(
    /\b(?:Sec(?:t|tion)?s?\.?|Ch(?:ap(?:ter)?)?\.?|Pages?|pp\.?)\s*\d+(?:\.\d+)*(?:\s*(?:&|and|[–,-])\s*(?:Sec(?:t|tion)?s?\.?\s*|Pages?\s*|pp\.?\s*)?\d+(?:\.\d+)*)*(?:\s*\([^)]*\))?/gi,
    ''
  );

  // 7. Clean leftover empty parens, dangling connectors, and duplicate spaces without corrupting C++ :: or ...
  text = text
    .replace(/\(\s*\)/g, '')
    .replace(/\s+([,.;])/g, '$1')
    .replace(/([,;])\s*[,;]+/g, '$1')
    .replace(/^\s*(?:[,;:.–—-]|and|&|&amp;)\s*/i, '')
    .replace(/\s*(?:[,;:–—-]|\band\b)\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // 8. Check if remaining plain text is meaningless boilerplate (< 4 chars or just repeats title/topic/course)
  const plain = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length < 4 || !/[a-zA-Z]/.test(plain)) return '';

  const normPlain = plain.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const normTitle = cardTitle.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const normTopic = topicTitle.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const normCourse = (course || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  if (
    normPlain === normTitle ||
    normPlain === normTopic ||
    normPlain === normCourse ||
    normPlain === `cse 109` ||
    normPlain === `${normCourse} ${normTopic}`
  ) {
    return '';
  }

  return text;
}

/**
 * Cleans section-number prefixes and textbook/guide parentheticals inside `.fmhtml` rich content
 * while preserving all academic points, tables, and formulas.
 */
export function sanitizeHtmlContentArtifacts(html?: string): string | undefined {
  if (!html) return undefined;
  let out = html;

  // Strip leading numbered section prefixes inside bold headings e.g. "<b>1.1 Top 40 Exam Reminders" -> "<b>Top 40 Exam Reminders"
  out = out.replace(
    /(<(?:b|strong)>\s*)\d+\.\d+(?:\.\d+)?\s+(?=[A-Za-z<])/g,
    '$1'
  );

  // Strip parenthetical textbook / Sec. / Rev. Guide tags inside .fmhtml headings
  out = out.replace(
    /\s*\((?:[^()]*\b(?:Schildt|Sadiku|Rev\.?\s*Guide|Revision\s+Guide|Sec(?:t|tion)?s?\.?|Ch(?:ap)?\.?)\b[^()]*)\)/gi,
    ''
  );

  return out;
}

/**
 * Generates a concise, domain-accurate explanation of a card's variables, parameters,
 * or practical/exam purpose whenever `bodyText` (`PARAMETERS // CONTEXT`) or `useText`
 * (`APPLICATION // STRATEGY`) is empty after stripping PDF/section artifacts.
 */
function ensureMeaningfulCardContext(
  cardId: string,
  topicId: string,
  course: CourseCode,
  cardTitle: string,
  topicTitle: string,
  rawLatex: string,
  codeContent: string | undefined,
  htmlContent: string | undefined,
  cleanedBodyText: string,
  cleanedUseText: string | undefined
): { bodyText: string; useText?: string } {
  // Resolve curated entry accurately across both 5..8 and 6..9 CSE-C indexing
  let curated: { bodyText?: string; useText?: string } | undefined =
    CURATED_CONTEXT_FALLBACKS[cardId];
  if (cardTitle === 'Top 40 C Exam Reminders & Core Mnemonics') {
    curated = CURATED_CONTEXT_FALLBACKS['cse-c:5'];
  } else if (cardTitle === 'C Data Types, 15-Level Precedence & Type Promotion') {
    curated = CURATED_CONTEXT_FALLBACKS['cse-c:6'];
  } else if (cardTitle === 'printf/scanf Formatting & Loop Conversions') {
    curated = CURATED_CONTEXT_FALLBACKS['cse-c:7'];
  } else if (cardTitle === '34 Common C/C++ Exam Traps & Fixes') {
    curated = CURATED_CONTEXT_FALLBACKS['cse-c:8'];
  } else if (cardId === 'cse-c:5' && cleanedBodyText) {
    curated = undefined;
  }

  const canonicalTopicId = topicId.replace(/^fm-/, '');
  const topicFallback =
    TOPIC_STRATEGY_AND_FUN_FACTS[topicId] || TOPIC_STRATEGY_AND_FUN_FACTS[canonicalTopicId];
  const symbolNotes = extractSymbolDescriptionsFromCard(rawLatex, codeContent, course);

  let bodyText = curated?.bodyText || cleanedBodyText || '';
  let useText = curated?.useText || cleanedUseText;

  if (!bodyText) {
    if (symbolNotes && topicFallback?.bodyFallback) {
      bodyText = `${symbolNotes}. ${topicFallback.bodyFallback}`;
    } else if (symbolNotes) {
      bodyText = symbolNotes;
    } else if (topicFallback?.bodyFallback) {
      bodyText = topicFallback.bodyFallback;
    } else if (course === 'CSE' || codeContent) {
      bodyText = `Defines core syntax, pointer/index invariants, and boundary conditions for ${cardTitle.toLowerCase()} in ${topicTitle}.`;
    } else if (rawLatex) {
      bodyText = `Relates the primary circuit/mathematical quantities in ${cardTitle} under standard ${topicTitle.toLowerCase()} assumptions.`;
    } else if (htmlContent) {
      bodyText = `Key conditions, parameter definitions, and structural properties governing ${cardTitle.toLowerCase()}.`;
    } else {
      bodyText = `Fundamental parameter relationships and operating conditions for ${cardTitle}.`;
    }
  }

  if (!useText) {
    if (topicFallback?.useFallback) {
      useText = topicFallback.useFallback;
    } else if (course === 'EEE') {
      useText = `Apply directly when setting up KCL/KVL, equivalent network reductions, or transient/phasor equations in ${topicTitle.toLowerCase()} problems.`;
    } else if (course === 'M157' || course === 'M159') {
      useText = `Verify continuity, differentiability, or domain bounds first, then substitute directly to evaluate ${topicTitle.toLowerCase()} exam problems.`;
    } else if (course === 'PHY') {
      useText = `Convert all wavelengths, lengths, and thermodynamic quantities to consistent SI units before substituting into ${cardTitle.toLowerCase()}.`;
    } else if (course === 'CSE') {
      useText = `Check null-terminator ('\\0'), 0-based array bounds, and base/corner cases when tracing output or writing ${topicTitle.toLowerCase()} code.`;
    }
  }

  return { bodyText, useText };
}

/**
 * Splits a single crammed C/C++ line (containing `{`, `;`, `}` on one line) into
 * individual logical lines while respecting string literals `"..."`, char literals `'...'`,
 * comments, `for (...)` headers, and `= { ... }` array/struct initializers.
 */
function unpackCrammedCseLine(line: string): string[] {
  const rawTrimmed = line.trim();
  if (!rawTrimmed) return [''];

  // Check if a long multi-statement line has a far-right padded trailing comment (3+ spaces before //)
  let extractedHeaderComment: string | null = null;
  let workingLine = rawTrimmed;
  const paddedCommentMatch = rawTrimmed.match(/^([\s\S]+?\S)\s{3,}(\/\/.*)$/);
  if (paddedCommentMatch && rawTrimmed.length > 68) {
    const codeBeforeComment = paddedCommentMatch[1].trim();
    const semiCountBefore = (codeBeforeComment.match(/;/g) || []).length;
    if (semiCountBefore >= 2 || codeBeforeComment.includes('{') || codeBeforeComment.includes('}')) {
      extractedHeaderComment = paddedCommentMatch[2].trim();
      workingLine = codeBeforeComment;
    }
  }

  // Collapse excessive padding spaces before trailing `//` comments on remaining lines
  const trimmed = workingLine.replace(/(\S)\s{3,}(\/\/.*)$/, '$1  $2');
  if (!trimmed) return extractedHeaderComment ? [extractedHeaderComment] : [''];

  // Keep preprocessor directives, pure comments, and short single statements intact
  if (
    trimmed.startsWith('#') ||
    trimmed.startsWith('//') ||
    (trimmed.startsWith('/*') && trimmed.endsWith('*/'))
  ) {
    return extractedHeaderComment ? [extractedHeaderComment, trimmed] : [trimmed];
  }

  // Keep compact switch case table rows (e.g., "case 'I': return 1; case 'V': return 5;") intact
  if (/^case\s+[^:]+:.*case\s+[^:]+:/.test(trimmed)) {
    return extractedHeaderComment ? [extractedHeaderComment, trimmed] : [trimmed];
  }

  const hasBraces = trimmed.includes('{') || trimmed.includes('}');
  const semicolonCount = (trimmed.match(/;/g) || []).length;

  // Keep short single-statement lines (<= 68 chars with at most one `;` inside a function body) on one clean line
  if (!hasBraces && trimmed.length <= 68 && semicolonCount <= 1) {
    return extractedHeaderComment ? [extractedHeaderComment, trimmed] : [trimmed];
  }

  // Decide whether this line needs unpacking:
  // 1. Multiple closing braces `} }` or statement followed by closing brace `; }`
  // 2. Opening brace `{` followed by statements on the same line (not an `= { ... }` initializer)
  // 3. Long line (> 68 chars) with multiple statements or braces
  const hasMultipleCloseBraces = /\}\s*\}/.test(trimmed) && !/=\s*\{/.test(trimmed);
  const hasTrailingCloseBraceAfterStmt = /;\s*\}\s*$/.test(trimmed) && !trimmed.includes('{');
  const hasOpenBraceWithCode =
    /\{\s*[^}\s]/.test(trimmed) &&
    !/=\s*\{/.test(trimmed) &&
    (trimmed.length > 62 || !trimmed.endsWith('}') || semicolonCount >= 2);
  const hasMultipleTopStatements =
    (trimmed.length > 68 || Boolean(extractedHeaderComment)) && semicolonCount >= 2;

  if (
    !hasMultipleCloseBraces &&
    !hasTrailingCloseBraceAfterStmt &&
    !hasOpenBraceWithCode &&
    !hasMultipleTopStatements &&
    !hasBraces
  ) {
    return extractedHeaderComment ? [extractedHeaderComment, trimmed] : [trimmed];
  }
  if (
    !hasMultipleCloseBraces &&
    !hasTrailingCloseBraceAfterStmt &&
    !hasOpenBraceWithCode &&
    !hasMultipleTopStatements &&
    trimmed.length <= 68
  ) {
    return extractedHeaderComment ? [extractedHeaderComment, trimmed] : [trimmed];
  }

  const out: string[] = [];
  if (extractedHeaderComment) {
    out.push(extractedHeaderComment);
  }
  let buf = '';
  let parenDepth = 0;
  let initBraceDepth = 0;
  let inStr: string | null = null;
  let inBlockComment = false;

  const flush = () => {
    const t = buf.trim();
    if (t) out.push(t);
    buf = '';
  };

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    const next = trimmed[i + 1];

    if (inBlockComment) {
      buf += ch;
      if (ch === '*' && next === '/') {
        buf += '/';
        i++;
        inBlockComment = false;
      }
      continue;
    }

    if (inStr) {
      buf += ch;
      if (ch === '\\' && next !== undefined) {
        buf += next;
        i++;
      } else if (ch === inStr) {
        inStr = null;
      }
      continue;
    }

    if (ch === '/' && next === '/') {
      const commentRest = trimmed.slice(i).trim();
      if (buf.trim()) {
        buf = `${buf.trim()} ${commentRest}`;
        flush();
      } else if (out.length > 0) {
        out[out.length - 1] = `${out[out.length - 1]} ${commentRest}`;
      } else {
        out.push(commentRest);
      }
      break;
    }

    if (ch === '/' && next === '*') {
      inBlockComment = true;
      buf += '/*';
      i++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inStr = ch;
      buf += ch;
      continue;
    }

    if (ch === '(') {
      parenDepth++;
      buf += ch;
      continue;
    }
    if (ch === ')') {
      parenDepth = Math.max(0, parenDepth - 1);
      buf += ch;
      continue;
    }

    if (ch === '{' && parenDepth === 0) {
      const before = buf.trim();
      if (/=\s*$/.test(before) || initBraceDepth > 0) {
        initBraceDepth++;
        buf += ch;
        continue;
      }
      buf = `${buf.trimEnd()} {`;
      flush();
      continue;
    }

    if (ch === '}' && parenDepth === 0) {
      if (initBraceDepth > 0) {
        initBraceDepth--;
        buf += ch;
        continue;
      }
      flush();
      if (next === ';') {
        out.push('};');
        i++;
      } else {
        out.push('}');
      }
      continue;
    }

    if (ch === ';' && parenDepth === 0 && initBraceDepth === 0) {
      buf += ';';
      if (
        trimmed.length > 68 ||
        hasMultipleTopStatements ||
        hasOpenBraceWithCode ||
        hasTrailingCloseBraceAfterStmt ||
        hasMultipleCloseBraces
      ) {
        flush();
      }
      continue;
    }

    buf += ch;
  }

  flush();
  return out.length > 0 ? out : [trimmed];
}

/**
 * Deterministic C/C++ AST-style Code Formatter (`formatCseCodeBlock`):
 * - Strips section-number prefixes in comments (e.g. `/* 4.1 Array syntax * /` -> `/* Array syntax * /`).
 * - Unpacks crammed one-liner functions, `for`/`while` loops, and multi-brace lines into clean lines.
 * - Re-indents with consistent 2-space K&R indentation based on `{` and `}` depth.
 */
export function formatCseCodeBlock(rawCode: string): string {
  if (!rawCode) return '';

  // 1. Normalize line endings and strip section-number prefixes inside comments
  const cleaned = rawCode
    .replace(/\r\n?/g, '\n')
    .replace(/(\/\*\s*)\d+\.\d+(?:\.\d+)?\s+(?=[A-Za-z])/g, '$1')
    .replace(/\s*\((?:Rev\.?\s*Guide\s*)?Sec(?:t|tion)?s?\.?\s*[\d.,\s–&-]+\)/gi, '')
    .trim();

  const rawLines = cleaned.split('\n');
  const unpackedLines: string[] = [];

  for (const rawLine of rawLines) {
    // Normalize excessive whitespace before `{` in function signatures: `int fn(char *s)        {` -> `int fn(char *s) {`
    const normalizedSig = rawLine.replace(/^(\s*[^/\n]+?\))\s{2,}\{/g, '$1 {');
    const pieces = unpackCrammedCseLine(normalizedSig);
    for (const p of pieces) {
      unpackedLines.push(p);
    }
  }

  // 2. Re-indent with consistent 2-space K&R indentation based on `{` and `}` depth
  const formatted: string[] = [];
  let indentDepth = 0;
  let inBlockComment = false;

  for (let i = 0; i < unpackedLines.length; i++) {
    const trimmed = unpackedLines[i].trim();
    if (!trimmed) {
      if (formatted.length > 0 && formatted[formatted.length - 1] !== '') {
        formatted.push('');
      }
      continue;
    }

    if (inBlockComment) {
      formatted.push(`${'  '.repeat(indentDepth)} ${trimmed}`);
      if (trimmed.includes('*/')) {
        inBlockComment = false;
      }
      continue;
    }

    if (trimmed.startsWith('/*') && !trimmed.includes('*/')) {
      formatted.push(`${'  '.repeat(indentDepth)}${trimmed}`);
      inBlockComment = true;
      continue;
    }

    // Count leading closing braces `}` so the line is dedented before printing
    let leadingClose = 0;
    while (leadingClose < trimmed.length && trimmed[leadingClose] === '}') {
      leadingClose++;
    }
    const lineDepth = Math.max(0, indentDepth - (leadingClose > 0 ? 1 : 0));

    // Preprocessor directives `#include` / `#define` at top level stay at column 0
    const isPreprocessor = trimmed.startsWith('#');
    const isAccessLabel = /^(?:public|private|protected)\s*:$/.test(trimmed);
    const effectiveDepth = isPreprocessor
      ? 0
      : isAccessLabel
      ? Math.max(0, lineDepth - 1)
      : lineDepth;

    formatted.push(`${'  '.repeat(effectiveDepth)}${trimmed}`);

    // Update indentDepth by scanning braces outside strings and comments on this line
    let inStr: string | null = null;
    let localComment = false;
    for (let c = 0; c < trimmed.length; c++) {
      const ch = trimmed[c];
      const next = trimmed[c + 1];
      if (localComment) {
        if (ch === '*' && next === '/') {
          localComment = false;
          c++;
        }
        continue;
      }
      if (inStr) {
        if (ch === '\\') c++;
        else if (ch === inStr) inStr = null;
        continue;
      }
      if (ch === '/' && next === '/') break;
      if (ch === '/' && next === '*') {
        localComment = true;
        c++;
        continue;
      }
      if (ch === '"' || ch === "'") {
        inStr = ch;
        continue;
      }
      if (ch === '{') indentDepth++;
      else if (ch === '}') indentDepth = Math.max(0, indentDepth - 1);
    }
  }

  return formatted.join('\n').trim();
}

/**
 * Extracts the inner HTML of `<div class="${className}">...</div>` while properly
 * balancing any nested `<div...>` / `</div>` pairs inside it.
 */
function extractBalancedDivContent(html: string, className: string): string | undefined {
  const startToken = `<div class="${className}">`;
  const startIdx = html.indexOf(startToken);
  if (startIdx === -1) return undefined;
  const contentStart = startIdx + startToken.length;
  let depth = 1;
  let i = contentStart;
  while (i < html.length && depth > 0) {
    const nextOpen = html.indexOf('<div', i);
    const nextClose = html.indexOf('</div>', i);
    if (nextClose === -1) break;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      const charAfter = html[nextOpen + 4];
      if (charAfter === ' ' || charAfter === '>' || charAfter === '\t' || charAfter === '\n') {
        depth++;
      }
      i = nextOpen + 4;
    } else {
      depth--;
      if (depth === 0) {
        return html.slice(contentStart, nextClose).trim();
      }
      i = nextClose + 6;
    }
  }
  return undefined;
}

/**
 * Finds the closing `>` of an opening HTML tag while ignoring any `>` characters
 * that appear inside quoted attribute values.
 *
 * @param rawTagContent Remainder of the opening tag after splitting on its prefix
 * @param startsInsideDoubleQuote Set to `true` when the split prefix opened a `"` (e.g. `<div class="fmi `)
 */
export function findOpeningTagEndIndex(
  rawTagContent: string,
  startsInsideDoubleQuote = false
): number {
  let quoteChar: string | null = startsInsideDoubleQuote ? '"' : null;
  for (let i = 0; i < rawTagContent.length; i++) {
    const ch = rawTagContent[i];
    if (quoteChar !== null) {
      if (ch === quoteChar) {
        quoteChar = null;
      }
      continue;
    }
    if (ch === '"') {
      quoteChar = '"';
      continue;
    }
    if (ch === "'" && i > 0 && rawTagContent[i - 1] === '=') {
      quoteChar = "'";
      continue;
    }
    if (ch === '>') {
      return i;
    }
  }
  return -1;
}

/**
 * Parses `<details class="fmt" ...>` topic accordions and `.fmi` cards from
 * `content-fmroot.html` or `content-thmroot.html`, applying:
 * - `cleanCardTitle` & `extractValidExamTag` (real exam years only, no `Sec.` or stray digits)
 * - `sanitizeContextText` & `ensureMeaningfulCardContext` (clean `.fmw`/`.fmu` with guaranteed meaningful context)
 * - `sanitizeHtmlContentArtifacts`
 * - `formatCseCodeBlock` (clean K&R 2-space formatted C/C++ code)
 */
export function parseTopicSections(html: string): TopicSectionRecord[] {
  if (!html) return [];
  const rawSections = html.split('<details class="fmt"').slice(1);
  const sections: TopicSectionRecord[] = [];
  const seenCardIds = new Set<string>();

  for (const rawSec of rawSections) {
    const openTagEnd = findOpeningTagEndIndex(rawSec, false);
    if (openTagEnd === -1) continue;
    const openTagAttrs = rawSec.slice(0, openTagEnd);
    const id = (openTagAttrs.match(/id="([^"]+)"/) || [])[1] || '';
    const canonicalSecId = id.replace(/^fm-/, '');
    const course = ((openTagAttrs.match(/data-c="([^"]+)"/) || [])[1] || 'ALL') as CourseCode;
    const isOpenByDefault = /\bopen\b/.test(openTagAttrs);

    const summaryMatch = rawSec.match(/<summary>([\s\S]*?)<\/summary>/);
    const summaryHtml = summaryMatch ? summaryMatch[1] : '';
    const titleRaw = (summaryHtml.match(/<span class="fmtt">([\s\S]*?)<\/span>/) || [])[1] || '';
    const title = decodeHtmlEntities(titleRaw).trim();
    const freqRaw = (summaryHtml.match(/<span class="fmfreq"[^>]*>([\s\S]*?)<\/span>/) || [])[1];
    const freqBadge = freqRaw ? decodeHtmlEntities(freqRaw).trim() : undefined;

    const rawCards = rawSec.split('<div class="fmi ').slice(1);
    const cards: FormulaCardRecord[] = [];

    for (let cardIdx = 0; cardIdx < rawCards.length; cardIdx++) {
      const rawCard = rawCards[cardIdx];
      const cardTagEnd = findOpeningTagEndIndex(rawCard, true);
      if (cardTagEnd === -1) continue;
      const cardAttrs = rawCard.slice(0, cardTagEnd);
      const cardTypeClass = (cardAttrs.match(/^([a-zA-Z0-9_-]+)/) || [])[1] || 'tex';
      let cardId = (cardAttrs.match(/data-k="([^"]+)"/) || [])[1] || `${canonicalSecId}:${cardIdx}`;
      // Fix duplicate data-k collisions where #cse-lib or #cse-ptr reused cse-c:6..8
      if (seenCardIds.has(cardId) || (canonicalSecId !== 'cse-c' && /^cse-c:[678]$/.test(cardId))) {
        cardId = `${canonicalSecId}:${cardIdx}`;
      }
      seenCardIds.add(cardId);
      const keywordsRaw = (cardAttrs.match(/data-s="([^"]*)"/) || [])[1] || '';
      const keywords = decodeHtmlEntities(keywordsRaw);

      const fmnRaw =
        (rawCard.match(/<span class="fmn">([\s\S]*?)<\/span>\s*<span class="fmb">/) || [])[1] || '';
      const badgeMatch = fmnRaw.match(/<span class="thty">([\s\S]*?)<\/span>/);
      const badge = badgeMatch ? decodeHtmlEntities(badgeMatch[1]).trim() : undefined;
      const rawCardTitle = decodeHtmlEntities(
        fmnRaw.replace(/<span class="thty">[\s\S]*?<\/span>/g, '')
      ).trim();
      const cleanedTitle = cleanCardTitle(rawCardTitle, cardId);

      const copyAttrMatch = rawCard.match(/data-t="([^"]*)"/);
      const copyText = copyAttrMatch
        ? decodeHtmlEntities(copyAttrMatch[1])
        : undefined;

      const bodyStartIdx = rawCard.indexOf('<div class="fmbody">');
      const bodyHtml = bodyStartIdx !== -1 ? rawCard.slice(bodyStartIdx) : '';

      const fmmInner = extractBalancedDivContent(bodyHtml, 'fmm');
      let rawLatex = '';
      let fmmDisplayMode = true;
      if (fmmInner !== undefined) {
        if (fmmInner.startsWith('$$') && fmmInner.endsWith('$$')) {
          rawLatex = decodeHtmlEntities(fmmInner.slice(2, -2).trim());
          fmmDisplayMode = true;
        } else if (fmmInner.startsWith('$') && fmmInner.endsWith('$')) {
          rawLatex = decodeHtmlEntities(fmmInner.slice(1, -1).trim());
          fmmDisplayMode = false;
        } else {
          rawLatex = decodeHtmlEntities(fmmInner);
          fmmDisplayMode = true;
        }
      }

      const rawHtmlContent = extractBalancedDivContent(bodyHtml, 'fmhtml');
      const htmlContent = sanitizeHtmlContentArtifacts(rawHtmlContent);

      const codeMatch = bodyHtml.match(/<pre class="fmcode"><code>([\s\S]*?)<\/code><\/pre>/);
      const rawCodeContent = codeMatch ? decodeHtmlEntities(codeMatch[1]) : undefined;
      const codeContent = rawCodeContent ? formatCseCodeBlock(rawCodeContent) : undefined;

      const rawBodyText = extractBalancedDivContent(bodyHtml, 'fmw') ?? '';
      const rawUseText = extractBalancedDivContent(bodyHtml, 'fmu');
      const rawNote = extractBalancedDivContent(bodyHtml, 'fmnote');
      const seeAlso = extractBalancedDivContent(bodyHtml, 'thsee');

      const sanitizedBody = sanitizeContextText(rawBodyText, cleanedTitle.title, title, course);
      const sanitizedUse = rawUseText
        ? sanitizeContextText(rawUseText, cleanedTitle.title, title, course) || undefined
        : undefined;
      const note = rawNote
        ? sanitizeContextText(rawNote, cleanedTitle.title, title, course) || undefined
        : undefined;

      const { bodyText, useText } = ensureMeaningfulCardContext(
        cardId,
        id,
        course,
        cleanedTitle.title,
        title,
        rawLatex,
        codeContent,
        htmlContent,
        sanitizedBody,
        sanitizedUse
      );

      // If no examTag was in the title, check if rawBodyText/rawUseText contained a genuine exam year
      const examTag =
        cleanedTitle.examTag ||
        extractValidExamTag(rawBodyText) ||
        extractValidExamTag(rawUseText);

      const fmdMatch = bodyHtml.match(
        /<details class="fmd">\s*<summary>([\s\S]*?)<\/summary>\s*<ol class="fmsteps">([\s\S]*?)<\/ol>\s*<\/details>/
      );
      let stepsSummary: string | undefined;
      let steps: string[] | undefined;
      if (fmdMatch) {
        stepsSummary = decodeHtmlEntities(fmdMatch[1]).trim();
        const stepsListHtml = fmdMatch[2];
        const liMatches = [...stepsListHtml.matchAll(/<li>([\s\S]*?)<\/li>/g)];
        steps = liMatches.map((m) => m[1].trim());
      }

      cards.push({
        id: cardId,
        course,
        topicId: id,
        topicTitle: title,
        title: cleanedTitle.title,
        fullTitle: rawCardTitle,
        examTag,
        badge,
        cardTypeClass,
        copyText,
        keywords,
        rawLatex,
        fmmDisplayMode,
        htmlContent,
        codeContent,
        bodyText,
        useText,
        stepsSummary,
        steps,
        note,
        seeAlso,
      });
    }

    sections.push({
      id,
      course,
      title,
      freqBadge,
      isOpenByDefault,
      cards,
    });
  }

  return sections;
}

function parseSingleNavBlock(navBlockHtml: string): NavCourseGroupRecord[] {
  if (!navBlockHtml) return [];
  const rowMatches = [
    ...navBlockHtml.matchAll(/<div class="fmnavrow" data-c="([^"]+)">([\s\S]*?)<\/div>/g),
  ];
  return rowMatches.map((m) => {
    const course = m[1] as CourseCode;
    const inner = m[2];
    const badgeRaw = (inner.match(/<b>([\s\S]*?)<\/b>/) || [])[1] || course;
    const badgeText = decodeHtmlEntities(badgeRaw).trim();
    const linkMatches = [
      ...inner.matchAll(/<a href="([^"]+)" class="fmlink">([\s\S]*?)<\/a>/g),
    ];
    const links: NavLinkRecord[] = linkMatches.map((lm) => {
      const href = lm[1];
      const targetId = href.startsWith('#') ? href.slice(1) : href;
      const label = decodeHtmlEntities(lm[2]).trim();
      return { href, targetId, label };
    });
    return { course, badgeText, links };
  });
}

/**
 * Parses `content-nav.html` into structured navigation groups for `#navF` and `#navT`.
 */
export function parseNavContent(navHtml: string): ParsedNavContent {
  const navFMatch = navHtml.match(/<nav class="fmnav" id="navF"[^>]*>([\s\S]*?)<\/nav>/);
  const navTMatch = navHtml.match(/<nav class="fmnav" id="navT"[^>]*>([\s\S]*?)<\/nav>/);
  return {
    navF: parseSingleNavBlock(navFMatch ? navFMatch[1] : ''),
    navT: parseSingleNavBlock(navTMatch ? navTMatch[1] : ''),
  };
}
