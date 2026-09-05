#!/usr/bin/env python3
"""Design-only opening balance experiment; replace with TS solver import in Phase 1.
Not an application engine: only valid, lifting opening configurations are supported.
"""
import functools
import itertools
import json
import math
from pathlib import Path

CONFIG = json.loads((Path(__file__).resolve().parents[1] / 'balance/opening.json').read_text())


def vehicle(levels):
    e, f, a = levels
    b, u = CONFIG['vehicle'], CONFIG['upgrades']
    return {
        'dry': b['structureKg'] / (1 + u['airframe']['massDivisorPerLevel'] * a)
               + b['engineKg'] + u['engine']['massKgPerLevel'] * e + u['fuel']['tankKgPerLevel'] * f,
        'fuel': b['fuelKg'] * (1 + u['fuel']['capacityPerLevel'] * f),
        'thrust': b['thrustN'] * (1 + u['engine']['thrustPerLevel'] * e),
        've': b['exhaustVelocityMps'] * (1 + u['engine']['exhaustPerLevel'] * e),
        'cda': b['dragAreaM2'] / (1 + u['airframe']['dragDivisorPerLevel'] * a),
    }


@functools.lru_cache(maxsize=None)
def flight(levels, dt=None):
    p, env, sim = vehicle(levels), CONFIG['environment'], CONFIG['simulation']
    dt = dt or sim['dtS']
    fuel, h, v, t = p['fuel'], 0., 0., 0.
    assert p['thrust'] > (p['dry'] + fuel) * env['gravityMps2'], 'probe requires immediate liftoff'
    while t < sim['maxTimeS']:
        powered = fuel > sim['fuelEpsilonKg']
        thrust = p['thrust'] if powered else 0.
        q = thrust / p['ve']
        d = min(dt, fuel / q) if q else dt

        def acceleration(height, speed, mass):
            gravity = env['gravityMps2'] * (env['radiusM'] / (env['radiusM'] + max(0., height))) ** 2
            density = env['densityKgM3'] * math.exp(-max(0., height) / env['scaleHeightM'])
            return thrust / mass - gravity - .5 * density * p['cda'] * speed * abs(speed) / mass

        a0 = acceleration(h, v, p['dry'] + fuel)
        hm, vm = h + v * d / 2, v + a0 * d / 2
        am = acceleration(hm, vm, p['dry'] + fuel - q * d / 2)
        hn, vn = h + vm * d, v + am * d
        if v > 0 >= vn:
            tau = -v / am
            return {'altitudeM': h + v * tau + .5 * am * tau * tau, 'flightTimeS': t + tau}
        fuel = max(0., fuel - q * d)
        h, v, t = hn, vn, t + d
        assert all(math.isfinite(x) for x in (h, v, t, fuel)) and h >= 0
    raise AssertionError('opening flight exceeded duration cap')


def cost(kind, level):
    c = CONFIG['costCurve']
    return math.ceil(CONFIG['upgrades'][kind]['baseCost'] * (1 + c['linear'] * level + c['quadratic'] * level ** 2))


def income(height):
    c = CONFIG['income']
    return c['baseCredits'] + math.floor(c['sqrtAltitudeCoefficient'] * math.sqrt(max(0., height)))


def campaign(policy):
    levels, credits, seconds, claimed = [0, 0, 0], 0, 0., set()
    kinds = ('engine', 'fuel', 'airframe')
    for launches in range(1, 301):
        result = flight(tuple(levels))
        seconds += CONFIG['upgrades']['ignition']['initialDelayS'] + result['flightTimeS'] + 4
        credits += income(result['altitudeM'])
        for m in CONFIG['milestones']:
            if result['altitudeM'] >= m['altitudeM'] and m['id'] not in claimed:
                credits += m['credits']; claimed.add(m['id'])
        if result['altitudeM'] >= 1000:
            return {'launches': launches, 'minutes': round(seconds / 60, 2), 'levels': levels,
                    'altitudeM': round(result['altitudeM'], 2)}
        while True:
            choices = []
            for i, kind in enumerate(kinds):
                price = cost(kind, levels[i])
                if levels[i] >= CONFIG['upgrades'][kind]['cap'] or price > credits:
                    continue
                nxt = list(levels); nxt[i] += 1
                gain = flight(tuple(nxt))['altitudeM'] - flight(tuple(levels))['altitudeM']
                score = gain / price if policy == 'altitude_per_credit' else -price
                choices.append((score, -i, price, nxt))
            if not choices:
                break
            _, _, price, levels = max(choices)
            credits -= price
    return {'unreached': True}


def report():
    rows = []
    worst_alt, worst_time, minimum_twr, negative_edges = 0., 0., math.inf, 0
    kinds = ('engine', 'fuel', 'airframe')
    ranges = [range(CONFIG['upgrades'][kind]['cap'] + 1) for kind in kinds]
    for levels in itertools.product(*ranges):
        coarse, fine = flight(levels), flight(levels, CONFIG['simulation']['dtS'] / 2)
        error = abs(coarse['altitudeM'] - fine['altitudeM'])
        time_error = abs(coarse['flightTimeS'] - fine['flightTimeS'])
        assert error <= max(.1, .001 * fine['altitudeM'])
        assert time_error <= .02
        worst_alt, worst_time = max(worst_alt, error), max(worst_time, time_error)
        p = vehicle(levels)
        minimum_twr = min(minimum_twr, p['thrust'] / ((p['dry'] + p['fuel']) * CONFIG['environment']['gravityMps2']))
        for i in range(3):
            if levels[i] < CONFIG['upgrades'][kinds[i]]['cap']:
                nxt = list(levels); nxt[i] += 1
                negative_edges += flight(tuple(nxt))['altitudeM'] < coarse['altitudeM']
    assert negative_edges == 0, 'opening purchase reduced altitude'
    for levels in ((0,0,0), (1,0,0), (0,1,0), (0,0,1), (2,2,2), (4,4,4), (8,8,8)):
        result = flight(levels)
        rows.append({'levels': levels, **{k: round(v, 6) for k, v in result.items()}, 'credits': income(result['altitudeM'])})
    return {'balanceVersion': CONFIG['balanceVersion'], 'modelVersion': CONFIG['modelVersion'],
            'scope': 'Design probe; lifting opening builds only. No application/save/event tests.',
            'fixtures': rows, 'audit': {'builds': math.prod(len(r) for r in ranges), 'worstAltitudeDifferenceM': worst_alt,
            'worstTimeDifferenceS': worst_time, 'minimumPadTWR': minimum_twr, 'negativeUpgradeEdges': negative_edges},
            'campaignAssumptions': '1x playback, 1.5 s ignition, 4 s decision time per launch, no ignition purchases; buy affordable physical upgrades until none remain; stable engine/fuel/airframe tie order.',
            'campaigns': {p: campaign(p) for p in ('altitude_per_credit', 'cheapest')}}


if __name__ == '__main__':
    print(json.dumps(report(), indent=2))
