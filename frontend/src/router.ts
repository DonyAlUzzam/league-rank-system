import { useEffect, useState } from 'react';

export const ROUTES = [
  'dashboard',
  'leagues',
  'teams',
  'players',
  'matches',
  'standings',
  'profile',
] as const;

export type Route = (typeof ROUTES)[number];

/** `#teams/abc` → `{route:'teams', param:'abc'}`; anything unknown → dashboard. */
const parse = () => {
  const [head, ...rest] = window.location.hash.replace(/^#\/?/, '').split('/');
  const route = ((ROUTES as readonly string[]).includes(head) ? head : 'dashboard') as Route;
  return { route, param: rest.join('/') };
};

/**
 * Minimal hash router — keeps the existing `<a href="#leagues">` nav links
 * working without pulling in a routing dependency.
 *
 * The second element is the optional id segment, so a detail page can live at
 * `#teams/<id>` while still sharing the sidebar entry (and active state) with
 * its list page. The third is kept for callers that navigate imperatively.
 */
export function useHashRoute(): [Route, string, (next: Route) => void] {
  const [loc, setLoc] = useState(parse);

  useEffect(() => {
    const onChange = () => setLoc(parse());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return [loc.route, loc.param, (next: Route) => {
    window.location.hash = next;
  }];
}
