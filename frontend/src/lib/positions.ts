/** The four positions, in the order a squad sheet lists them. */
export type Position = 'GOALKEEPER' | 'DEFENDER' | 'MIDFIELDER' | 'FORWARD';

/** Short forms used wherever a player's role is shown as a pill. */
export const POS_LABEL: Record<Position, string> = {
  GOALKEEPER: 'GK',
  DEFENDER: 'DEF',
  MIDFIELDER: 'MID',
  FORWARD: 'FWD',
};

export const POSITIONS = Object.keys(POS_LABEL) as Position[];
