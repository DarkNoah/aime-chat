import z from 'zod';
import BaseTool from '../base-tool';
import BaseToolkit, { BaseToolkitParams } from '../base-toolkit';

type EmployeeLevel = 'junior' | 'mid' | 'senior' | 'staff' | 'principal';
type QuarterKey = 'Q1' | 'Q2' | 'Q3' | 'Q4';
type ExpenseCategory =
  | 'travel'
  | 'lodging'
  | 'meals'
  | 'software'
  | 'equipment'
  | 'conference'
  | 'office'
  | 'internet';
type ExpenseStatus = 'approved' | 'pending' | 'rejected';
type PaymentMethod = 'corporate_card' | 'personal_reimbursement';

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  level: EmployeeLevel;
  email: string;
  department: string;
}

export interface ExpenseLineItem {
  expense_id: string;
  date: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  currency: string;
  status: ExpenseStatus;
  receipt_url: string;
  approved_by: string | null;
  store_name: string;
  store_location: string;
  reimbursement_date: string | null;
  payment_method: PaymentMethod;
  project_code: string;
  notes: string;
}

export interface TravelBudgetInfo {
  user_id: string;
  has_custom_budget: boolean;
  travel_budget: number;
  reason: string;
  currency: string;
}

interface ExpenseCategoryTemplate {
  category: ExpenseCategory;
  description: string;
  minAmount: number;
  maxAmount: number;
}

interface WeightedStatus {
  value: ExpenseStatus;
  weight: number;
}

const DEFAULT_DELAY_MULTIPLIER = 0.1;
const BASE_DELAY_MS = 100;
const EXPENSE_DELAY_MULTIPLIER = 0.2;
const BUDGET_DELAY_MULTIPLIER = 0.05;
const EXPENSE_LINE_ITEMS_PER_PERSON_MIN = 5;
const EXPENSE_LINE_ITEMS_PER_PERSON_MAX = 150;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const STANDARD_TRAVEL_BUDGET = 5000;
const DEFAULT_CURRENCY = 'USD';

const QUARTER_DATE_RANGES: Record<QuarterKey, { start: string; end: string }> =
  {
    Q1: { start: '2024-01-01', end: '2024-03-31' },
    Q2: { start: '2024-04-01', end: '2024-06-30' },
    Q3: { start: '2024-07-01', end: '2024-09-30' },
    Q4: { start: '2024-10-01', end: '2024-12-31' },
  };

const EXPENSE_CATEGORY_TEMPLATES: ExpenseCategoryTemplate[] = [
  {
    category: 'travel',
    description: 'Flight to client meeting',
    minAmount: 400,
    maxAmount: 1500,
  },
  {
    category: 'travel',
    description: 'Train ticket',
    minAmount: 1000,
    maxAmount: 1500,
  },
  {
    category: 'travel',
    description: 'Rental car',
    minAmount: 1000,
    maxAmount: 1500,
  },
  {
    category: 'travel',
    description: 'Taxi/Uber',
    minAmount: 150,
    maxAmount: 200,
  },
  {
    category: 'travel',
    description: 'Parking fee',
    minAmount: 10,
    maxAmount: 50,
  },
  {
    category: 'lodging',
    description: 'Hotel stay',
    minAmount: 150,
    maxAmount: 1900,
  },
  {
    category: 'lodging',
    description: 'Airbnb rental',
    minAmount: 1000,
    maxAmount: 1950,
  },
  {
    category: 'meals',
    description: 'Client dinner',
    minAmount: 50,
    maxAmount: 250,
  },
  {
    category: 'meals',
    description: 'Team lunch',
    minAmount: 20,
    maxAmount: 100,
  },
  {
    category: 'meals',
    description: 'Conference breakfast',
    minAmount: 15,
    maxAmount: 40,
  },
  {
    category: 'meals',
    description: 'Coffee meeting',
    minAmount: 5,
    maxAmount: 25,
  },
  {
    category: 'software',
    description: 'SaaS subscription',
    minAmount: 10,
    maxAmount: 200,
  },
  {
    category: 'software',
    description: 'API credits',
    minAmount: 50,
    maxAmount: 500,
  },
  {
    category: 'equipment',
    description: 'Monitor',
    minAmount: 200,
    maxAmount: 800,
  },
  {
    category: 'equipment',
    description: 'Keyboard',
    minAmount: 50,
    maxAmount: 200,
  },
  {
    category: 'equipment',
    description: 'Webcam',
    minAmount: 50,
    maxAmount: 150,
  },
  {
    category: 'equipment',
    description: 'Headphones',
    minAmount: 100,
    maxAmount: 300,
  },
  {
    category: 'conference',
    description: 'Conference ticket',
    minAmount: 500,
    maxAmount: 2500,
  },
  {
    category: 'conference',
    description: 'Workshop registration',
    minAmount: 200,
    maxAmount: 1000,
  },
  {
    category: 'office',
    description: 'Office supplies',
    minAmount: 10,
    maxAmount: 100,
  },
  { category: 'office', description: 'Books', minAmount: 20, maxAmount: 80 },
  {
    category: 'internet',
    description: 'Mobile data',
    minAmount: 30,
    maxAmount: 100,
  },
  {
    category: 'internet',
    description: 'WiFi hotspot',
    minAmount: 20,
    maxAmount: 60,
  },
];

const EXPENSE_STATUS_WEIGHTS: WeightedStatus[] = [
  { value: 'approved', weight: 85 },
  { value: 'pending', weight: 10 },
  { value: 'rejected', weight: 5 },
];

const MANAGERS = [
  'Sarah Johnson',
  'Michael Chen',
  'Emily Rodriguez',
  'David Park',
  'Jennifer Martinez',
];

const MERCHANTS: Record<ExpenseCategory, string[]> = {
  travel: [
    'United Airlines',
    'Delta',
    'American Airlines',
    'Southwest',
    'Enterprise Rent-A-Car',
  ],
  lodging: ['Marriott', 'Hilton', 'Hyatt', 'Airbnb', 'Holiday Inn'],
  meals: [
    'Olive Garden',
    'Starbucks',
    'The Capital Grille',
    'Chipotle',
    'Panera Bread',
  ],
  software: ['AWS', 'GitHub', 'Linear', 'Notion', 'Figma'],
  equipment: ['Amazon', 'Best Buy', 'Apple Store', 'B&H Photo', 'Newegg'],
  conference: [
    'EventBrite',
    'WWDC',
    'AWS re:Invent',
    'Google I/O',
    'ReactConf',
  ],
  office: ['Staples', 'Office Depot', 'Amazon', 'Target'],
  internet: ['Verizon', 'AT&T', 'T-Mobile', 'Comcast'],
};

const CITIES = [
  'San Francisco, CA',
  'New York, NY',
  'Austin, TX',
  'Seattle, WA',
  'Boston, MA',
  'Chicago, IL',
  'Denver, CO',
  'Los Angeles, CA',
  'Portland, OR',
  'Miami, FL',
];

const PROJECT_CODES = [
  'PROJ-1001',
  'PROJ-1002',
  'PROJ-2001',
  'DEPT-ENG',
  'DEPT-OPS',
  'CLIENT-A',
  'CLIENT-B',
];

const JUSTIFICATIONS: Record<ExpenseCategory, string[]> = {
  travel: [
    'Client meeting to discuss Q4 roadmap and requirements',
    'On-site visit for infrastructure review and planning',
    'Conference attendance for professional development',
    'Team offsite for strategic planning session',
    'Customer presentation and product demo',
  ],
  lodging: [
    'Hotel for multi-day client visit',
    'Accommodation during conference attendance',
    'Extended stay for project implementation',
    'Lodging for team collaboration week',
  ],
  meals: [
    'Client dinner discussing partnership opportunities',
    'Team lunch during sprint planning',
    'Breakfast meeting with stakeholders',
    'Working dinner during crunch period',
  ],
  software: [
    'Required tool for development workflow',
    'API credits for production workload',
    'Team collaboration platform subscription',
    'Design and prototyping tool license',
  ],
  equipment: [
    'Replacing failed hardware',
    'Upgraded monitor for productivity',
    'Required for remote work setup',
    'Better equipment for video calls',
  ],
  conference: [
    'Professional development - learning new technologies',
    'Networking with industry leaders and potential partners',
    'Presenting company work at industry event',
    'Training workshop for certification',
  ],
  office: [
    'Supplies for home office setup',
    'Reference materials for project work',
    'Team whiteboarding supplies',
  ],
  internet: [
    'Mobile hotspot for reliable connectivity',
    'Upgraded internet for remote work',
    'International data plan for travel',
  ],
};

const PAYMENT_METHODS: PaymentMethod[] = [
  'corporate_card',
  'personal_reimbursement',
];

const CUSTOM_BUDGETS: Record<string, TravelBudgetInfo> = {
  ENG002: {
    user_id: 'ENG002',
    has_custom_budget: true,
    travel_budget: 8000,
    reason: 'Staff engineer with regular client site visits',
    currency: DEFAULT_CURRENCY,
  },
  ENG004: {
    user_id: 'ENG004',
    has_custom_budget: true,
    travel_budget: 12000,
    reason:
      'Principal engineer leading distributed team across multiple offices',
    currency: DEFAULT_CURRENCY,
  },
  SAL004: {
    user_id: 'SAL004',
    has_custom_budget: true,
    travel_budget: 15000,
    reason: 'Regional sales director covering west coast territory',
    currency: DEFAULT_CURRENCY,
  },
  SAL006: {
    user_id: 'SAL006',
    has_custom_budget: true,
    travel_budget: 20000,
    reason: 'VP of Sales with extensive client travel requirements',
    currency: DEFAULT_CURRENCY,
  },
  MKT004: {
    user_id: 'MKT004',
    has_custom_budget: true,
    travel_budget: 10000,
    reason:
      'Director of Marketing attending industry conferences and partner meetings',
    currency: DEFAULT_CURRENCY,
  },
};

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const hashStringToSeed = (value: string) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
    hash >>>= 0;
  }
  return hash || 0xdeadbeef;
};

const mulberry32 = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const randomInt = (rng: () => number, min: number, max: number) =>
  Math.floor(rng() * (max - min + 1)) + min;

const randomFloatInRange = (rng: () => number, min: number, max: number) =>
  rng() * (max - min) + min;

const randomChoice = <T>(rng: () => number, items: T[]): T =>
  items[randomInt(rng, 0, items.length - 1)];

const weightedRandomStatus = (rng: () => number) => {
  const totalWeight = EXPENSE_STATUS_WEIGHTS.reduce(
    (acc, item) => acc + item.weight,
    0,
  );
  const threshold = rng() * totalWeight;
  let cumulative = 0;
  for (const item of EXPENSE_STATUS_WEIGHTS) {
    cumulative += item.weight;
    if (threshold <= cumulative) {
      return item.value;
    }
  }
  return EXPENSE_STATUS_WEIGHTS[0].value;
};

const toDate = (value: string) => new Date(`${value}T00:00:00Z`);

const addDays = (date: Date, days: number) =>
  new Date(date.getTime() + days * MS_PER_DAY);

const formatDate = (date: Date) => date.toISOString().slice(0, 10);

export class GetTeamMembers extends BaseTool {
  static readonly toolName = 'get_team_members';
  id = 'get_team_members';
  description = `Returns a list of team members for a given department.

    Each team member includes their ID, name, role, level, and contact information.
    Use this to get a list of people whose expenses you want to analyze.

    Args:
        department: The department name (e.g., 'engineering', 'sales', 'marketing').
            Case-insensitive.

    Returns:
        JSON string containing an array of team member objects with fields:
        - id: Unique employee identifier
        - name: Full name
        - role: Job title
        - level: Employee level (junior, mid, senior, staff, principal)
        - email: Contact email
        - department: Department name`;

  inputSchema = z.object({
    department: z
      .string()
      .min(1, 'department 不能为空')
      .describe("Department name, e.g. 'engineering', 'sales', 'marketing'."),
  });

  execute = async (inputData: z.infer<typeof this.inputSchema>) => {
    const departmentKey = inputData.department.trim().toLowerCase();

    await sleep(DEFAULT_DELAY_MULTIPLIER * BASE_DELAY_MS);

    const TEAMS_DATA: Record<string, TeamMember[]> = {
      engineering: [
        {
          id: 'ENG001',
          name: 'Alice Chen',
          role: 'Senior Software Engineer',
          level: 'senior',
          email: 'alice.chen@company.com',
          department: 'engineering',
        },
        {
          id: 'ENG002',
          name: 'Bob Martinez',
          role: 'Staff Engineer',
          level: 'staff',
          email: 'bob.martinez@company.com',
          department: 'engineering',
        },
        {
          id: 'ENG003',
          name: 'Carol White',
          role: 'Software Engineer',
          level: 'mid',
          email: 'carol.white@company.com',
          department: 'engineering',
        },
        {
          id: 'ENG004',
          name: 'David Kim',
          role: 'Principal Engineer',
          level: 'principal',
          email: 'david.kim@company.com',
          department: 'engineering',
        },
        {
          id: 'ENG005',
          name: 'Emma Johnson',
          role: 'Junior Software Engineer',
          level: 'junior',
          email: 'emma.johnson@company.com',
          department: 'engineering',
        },
        {
          id: 'ENG006',
          name: 'Frank Liu',
          role: 'Senior Software Engineer',
          level: 'senior',
          email: 'frank.liu@company.com',
          department: 'engineering',
        },
        {
          id: 'ENG007',
          name: 'Grace Taylor',
          role: 'Software Engineer',
          level: 'mid',
          email: 'grace.taylor@company.com',
          department: 'engineering',
        },
        {
          id: 'ENG008',
          name: 'Henry Park',
          role: 'Staff Engineer',
          level: 'staff',
          email: 'henry.park@company.com',
          department: 'engineering',
        },
      ],
      sales: [
        {
          id: 'SAL001',
          name: 'Irene Davis',
          role: 'Account Executive',
          level: 'mid',
          email: 'irene.davis@company.com',
          department: 'sales',
        },
        {
          id: 'SAL002',
          name: 'Jack Wilson',
          role: 'Senior Account Executive',
          level: 'senior',
          email: 'jack.wilson@company.com',
          department: 'sales',
        },
        {
          id: 'SAL003',
          name: 'Kelly Brown',
          role: 'Sales Development Rep',
          level: 'junior',
          email: 'kelly.brown@company.com',
          department: 'sales',
        },
        {
          id: 'SAL004',
          name: 'Leo Garcia',
          role: 'Regional Sales Director',
          level: 'staff',
          email: 'leo.garcia@company.com',
          department: 'sales',
        },
        {
          id: 'SAL005',
          name: 'Maya Patel',
          role: 'Account Executive',
          level: 'mid',
          email: 'maya.patel@company.com',
          department: 'sales',
        },
        {
          id: 'SAL006',
          name: 'Nathan Scott',
          role: 'VP of Sales',
          level: 'principal',
          email: 'nathan.scott@company.com',
          department: 'sales',
        },
      ],
      marketing: [
        {
          id: 'MKT001',
          name: 'Olivia Thompson',
          role: 'Marketing Manager',
          level: 'senior',
          email: 'olivia.thompson@company.com',
          department: 'marketing',
        },
        {
          id: 'MKT002',
          name: 'Peter Anderson',
          role: 'Content Specialist',
          level: 'mid',
          email: 'peter.anderson@company.com',
          department: 'marketing',
        },
        {
          id: 'MKT003',
          name: 'Quinn Rodriguez',
          role: 'Marketing Coordinator',
          level: 'junior',
          email: 'quinn.rodriguez@company.com',
          department: 'marketing',
        },
        {
          id: 'MKT004',
          name: 'Rachel Lee',
          role: 'Director of Marketing',
          level: 'staff',
          email: 'rachel.lee@company.com',
          department: 'marketing',
        },
        {
          id: 'MKT005',
          name: 'Sam Miller',
          role: 'Social Media Manager',
          level: 'mid',
          email: 'sam.miller@company.com',
          department: 'marketing',
        },
      ],
    };

    const members = TEAMS_DATA[departmentKey];
    if (!members) {
      const availableDepartments = Object.keys(TEAMS_DATA);
      return JSON.stringify(
        {
          error: `Department '${departmentKey}' not found. Available departments: ${availableDepartments.length > 0 ? availableDepartments.join(', ') : 'N/A'}`,
        },
        null,
        2,
      );
    }

    return JSON.stringify(members, null, 2);
  };
}

export class GetExpenses extends BaseTool {
  static readonly toolName = 'get_expenses';
  id = 'get_expenses';
  description = `
Returns all expense line items for a given employee in a specific quarter.

    Each expense includes comprehensive metadata: date, category, description, amount,
    receipt details, approval chain, merchant information, and more. An employee may
    have anywhere from a few to 150+ expense line items per quarter, and each line
    item contains substantial metadata for audit and compliance purposes.

    Args:
        employee_id: The unique employee identifier (e.g., 'ENG001', 'SAL002')
        quarter: Quarter identifier (e.g., 'Q1', 'Q2', 'Q3', 'Q4')

    Returns:
        JSON string containing an array of expense objects with fields:
        - expense_id: Unique expense identifier
        - date: ISO format date when expense occurred
        - category: Expense type (travel, meals, lodging, software, equipment, etc.)
        - description: Details about the expense
        - amount: Dollar amount (float)
        - currency: Currency code (default 'USD')
        - status: Approval status (approved, pending, rejected)
        - receipt_url: URL to uploaded receipt image
        - approved_by: Manager or finance person who approved
        - store_name: Merchant or vendor name
        - store_location: City and state of merchant
        - reimbursement_date: When the expense was reimbursed (if applicable)
        - payment_method: How it was paid (corporate_card, personal_reimbursement)
        - project_code: Project or cost center code
        - notes: Employee justification or additional context`;

  inputSchema = z.object({
    employee_id: z
      .string()
      .min(1, 'employee_id 不能为空')
      .describe("Employee identifier, e.g. 'ENG001' or 'SAL002'."),
    quarter: z
      .string()
      .min(2)
      .describe("Quarter identifier, e.g. 'Q1', 'Q2', 'Q3', 'Q4'."),
  });

  execute = async (inputData: z.infer<typeof this.inputSchema>) => {
    const employeeId = inputData.employee_id.trim().toUpperCase();
    const quarter = inputData.quarter.trim().toUpperCase() as QuarterKey;

    await sleep(EXPENSE_DELAY_MULTIPLIER * BASE_DELAY_MS);

    if (!QUARTER_DATE_RANGES[quarter]) {
      return JSON.stringify(
        {
          error: `Invalid quarter '${quarter}'. Must be Q1, Q2, Q3, or Q4`,
        },
        null,
        2,
      );
    }

    const seed = hashStringToSeed(`${employeeId}_${quarter}`);
    const rng = mulberry32(seed);
    const expensesCount = randomInt(
      rng,
      EXPENSE_LINE_ITEMS_PER_PERSON_MIN,
      EXPENSE_LINE_ITEMS_PER_PERSON_MAX,
    );

    const { start, end } = QUARTER_DATE_RANGES[quarter];
    const startDate = toDate(start);
    const endDate = toDate(end);
    const dayDiff = Math.max(
      0,
      Math.round((endDate.getTime() - startDate.getTime()) / MS_PER_DAY),
    );

    const expenses: ExpenseLineItem[] = [];
    for (let i = 0; i < expensesCount; i += 1) {
      const template = randomChoice(rng, EXPENSE_CATEGORY_TEMPLATES);
      const expenseDate = addDays(startDate, randomInt(rng, 0, dayDiff));
      const amount = Number(
        randomFloatInRange(rng, template.minAmount, template.maxAmount).toFixed(
          2,
        ),
      );
      const status = weightedRandomStatus(rng);
      const paymentMethod = randomChoice(rng, PAYMENT_METHODS);
      const merchantList = MERCHANTS[template.category] ?? ['Unknown Merchant'];
      const approvedBy =
        status === 'approved' ? randomChoice(rng, MANAGERS) : null;
      const reimbursementDate =
        status === 'approved' && paymentMethod === 'personal_reimbursement'
          ? formatDate(addDays(expenseDate, randomInt(rng, 15, 30)))
          : null;

      expenses.push({
        expense_id: `${employeeId}_${quarter}_${String(i).padStart(3, '0')}`,
        date: formatDate(expenseDate),
        category: template.category,
        description: template.description,
        amount,
        currency: 'USD',
        status,
        receipt_url: `https://receipts.company.com/${employeeId}/${quarter}/${String(i).padStart(3, '0')}.pdf`,
        approved_by: approvedBy,
        store_name: randomChoice(rng, merchantList),
        store_location: randomChoice(rng, CITIES),
        reimbursement_date: reimbursementDate,
        payment_method: paymentMethod,
        project_code: randomChoice(rng, PROJECT_CODES),
        notes: randomChoice(
          rng,
          JUSTIFICATIONS[template.category] ?? ['Business expense'],
        ),
      });
    }

    expenses.sort((a, b) => a.date.localeCompare(b.date));

    return JSON.stringify(expenses, null, 2);
  };
}

export class GetCustomBudget extends BaseTool {
  static readonly toolName = 'get_custom_budget';
  id = 'get_custom_budget';
  description = `
Get the custom quarterly travel budget for a specific employee.

    Most employees have a standard $5,000 quarterly travel budget. However, some
    employees have custom budget exceptions based on their role requirements.
    This function checks if a specific employee has a custom budget assigned.

    Args:
        user_id: The unique employee identifier (e.g., 'ENG001', 'SAL002')

    Returns:
        JSON string containing:
        - user_id: Employee identifier
        - has_custom_budget: Boolean indicating if custom budget exists
        - travel_budget: Quarterly travel budget amount (custom or standard $5,000)
        - reason: Explanation for custom budget (if applicable)
        - currency: Currency code (default 'USD')
`;

  inputSchema = z.object({
    user_id: z
      .string()
      .min(1, 'user_id 不能为空')
      .describe("Employee identifier, e.g. 'ENG001'."),
  });

  execute = async (inputData: z.infer<typeof this.inputSchema>) => {
    const userId = inputData.user_id.trim().toUpperCase();

    await sleep(BUDGET_DELAY_MULTIPLIER * BASE_DELAY_MS);

    const customBudget = CUSTOM_BUDGETS[userId];
    if (customBudget) {
      return JSON.stringify(customBudget, null, 2);
    }

    const result: TravelBudgetInfo = {
      user_id: userId,
      has_custom_budget: false,
      travel_budget: STANDARD_TRAVEL_BUDGET,
      reason: 'Standard quarterly travel budget',
      currency: DEFAULT_CURRENCY,
    };

    return JSON.stringify(result, null, 2);
  };
}

class ExpenseManagementToolkit extends BaseToolkit {
  static readonly toolName = 'expense_management_toolkit';
  id = 'expense_management_toolkit';
  constructor(params?: BaseToolkitParams) {
    super(
      [new GetTeamMembers(), new GetExpenses(), new GetCustomBudget()],
      params,
    );
  }

  getTools() {
    return this.tools;
  }
}
export default ExpenseManagementToolkit;
