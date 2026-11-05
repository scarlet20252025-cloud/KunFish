# -*- coding: utf-8 -*-
"""Review candidates emitted by scripts/collect-meme-candidates.js. Does not mutate live lexicons."""
import json
import sys

if len(sys.argv) < 2:
    print("Usage: python tools/review-meme-candidates.py <candidate.jsonl> [approved.jsonl]")
    raise SystemExit(2)
source = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else source.rsplit('.', 1)[0] + '.approved.jsonl'
with open(source, "r", encoding="utf-8-sig") as f:
    rows = [json.loads(line) for line in f if line.strip()]
reviewed = []
for row in rows:
    print("\n候选：%s（出现 %s 次）" % (row.get("term"), row.get("occurrences")))
    print("样本引用：" + repr(row.get("sampleRefs", [])))
    choice = input("人工决定 [a=保留/d=丢弃/Enter=暂缓]: ").strip().lower()
    if choice == 'a':
        definition = input("请写清适用语境和含义（不要写隐私）: ").strip()
        if definition and len(definition) <= 500:
            reviewed.append({"term": row.get("term"), "definition": definition, "reviewed": True, "occurrences": row.get("occurrences")})
with open(out, "w", encoding="utf-8") as f:
    for row in reviewed:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")
print("approved=%d output=%s (仍需人工合并到正式词库)" % (len(reviewed), out))
