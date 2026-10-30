# 用 CadQuery 读入浏览器下载的 STEP，确认非空且有实体：python3 tests/check_step_files.py <下载目录>
import sys, json, cadquery as cq
d = sys.argv[1]; fail = 0
for f in json.load(open(d + '/step_files.json')):
    try:
        sh = cq.importers.importStep(f).val(); n = len(sh.Solids()); v = sh.Volume()
        good = n >= 1 and v > 1 and sh.isValid() and (n == 1 or 'whole_print' not in f)   # 融合整体必须是 1 个有效实体
    except Exception as e: good, n, v = False, 0, str(e)
    print(('PASS ' if good else 'FAIL ') + f.split('/')[-1], f'实体 {n} 体积 {v}'); fail += not good
print('全部通过' if not fail else f'失败 {fail} 项'); sys.exit(1 if fail else 0)
