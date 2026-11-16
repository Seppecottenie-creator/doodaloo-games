/** Eén voorwerp of personage uit de pool (data/objects.json). */
export interface GameObject {
  id: string;
  name: string;
  description: string;
  grams: number;
  fictional: boolean;
  /** 1 = herkenbaar en alledaags … 5 = absurd of loodzwaar. */
  difficulty: 1 | 2 | 3 | 4 | 5;
  tags: string[];
  /** Pad relatief aan /public, bv. "objects/baksteen.webp". Optioneel: de emoji is de fallback. */
  image?: string;
  emoji: string;
  /** Verplicht bij echte voorwerpen. */
  source?: string;
  funFact: string;
  /** True als het gewicht een schatting of gemiddelde is ("± 8 t (schatting)"). */
  estimate?: boolean;
}

export type Mode = 'daily' | 'practice';

export interface RoundResult {
  objectId: string;
  guess: number;
  actual: number;
  score: number;
}
