
import { AggregatedDataPoint, Category } from '@/types';
import { PROJECTS } from '@/constants';

// Helper to get random subset of projects to simulate active work
const getRandomProjects = (category: Category, count: number) => {
  const catProjects = PROJECTS.filter(p => p.category === category);
  const shuffled = [...catProjects].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
};

export const generateMockHistory = (context: 'department' | 'rd_team' | 'support_team' | 'user' = 'department'): AggregatedDataPoint[] => {
  const data: AggregatedDataPoint[] = [];
  const currentYear = new Date().getFullYear();
  
  // Configure weights based on context
  let rdWeight = 1;
  let supportWeight = 1;
  let mfgWeight = 1;
  let volatility = 1; // Higher means more random spikes

  if (context === 'rd_team') {
    rdWeight = 2.5;
    supportWeight = 0.5;
    mfgWeight = 0.5;
    volatility = 1.2;
  } else if (context === 'support_team') {
    rdWeight = 0.3;
    supportWeight = 2.0;
    mfgWeight = 2.0;
    volatility = 1.1;
  } else if (context === 'user') {
    rdWeight = 1;
    supportWeight = 1;
    mfgWeight = 1;
    volatility = 3.0; // Individual users are "spikier"
  }

  // Pick active projects for the context
  const activeRd = getRandomProjects(Category.RD, context === 'user' ? 2 : 6);
  const activeSupport = getRandomProjects(Category.RD_SUPPORT, context === 'user' ? 1 : 4);
  const activeMfg = getRandomProjects(Category.MFG_SUPPORT, context === 'user' ? 1 : 4);
  const allActive = [...activeRd, ...activeSupport, ...activeMfg];

  // Generate 52 weeks of mock data (1 year)
  for (let i = 0; i < 52; i++) {
    const weekNum = i + 1;
    const point: AggregatedDataPoint = {
      name: `W${weekNum}`,
      year: currentYear,
      week: weekNum,
      rd: 0,
      support: 0,
      mfg: 0,
      leave: i === 6 || i === 25 ? (context === 'user' ? 40 : 120) : Math.max(0, (5 * volatility) + Math.random() * 10), 
    };

    // Generate hours for individual projects first
    allActive.forEach(project => {
      // Simulate trends
      const trend = Math.sin((i * 0.1) + allActive.indexOf(project)); 
      
      let base = 15;
      if (context === 'user') base = 8; // Lower base for single user
      
      let multiplier = 1;
      if (project.category === Category.RD) multiplier = rdWeight;
      if (project.category === Category.RD_SUPPORT) multiplier = supportWeight;
      if (project.category === Category.MFG_SUPPORT) multiplier = mfgWeight;

      const randomFactor = Math.random() * 5 * volatility;
      const hours = Math.max(0, (base * multiplier) + (trend * 5) + randomFactor);
      
      // Assign to project key
      point[project.id] = hours;

      // Aggregate to category
      if (project.category === Category.RD) point.rd = (point.rd as number) + hours;
      if (project.category === Category.RD_SUPPORT) point.support = (point.support as number) + hours;
      if (project.category === Category.MFG_SUPPORT) point.mfg = (point.mfg as number) + hours;
    });

    data.push(point);
  }
  return data;
};

export const generateMockUserHistory = (): AggregatedDataPoint[] => {
  return generateMockHistory('user');
};
