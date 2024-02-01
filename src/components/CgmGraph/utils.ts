// Accessors for D3 calculations
import {BgSample} from 'app/types/day_bgs';

export const xAccessor = (d: BgSample) => new Date(d.date);
export const yAccessor = (d: BgSample) => d.sgv;


