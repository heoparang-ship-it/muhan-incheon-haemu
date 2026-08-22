using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using UnityEditor;
using UnityEngine;

namespace Haemu.Editor
{
    /// <summary>문화재청 패키지에서 돛 메시·프리팹 후보를 점수화해 나열한다.</summary>
    public static class HaemuKhsSailCatalog
    {
        const string MenuRoot = "Haemu/문화재청/";

        public sealed class Candidate
        {
            public string Guid;
            public string Path;
            public string Name;
            public string Kind;
            public int Score;
            public string Why;
            public bool PrimaryPackage;
            public bool SecondaryPackage;
        }

        [MenuItem(MenuRoot + "돛 메시·프리팹 후보 나열", false, 40)]
        public static void ListAndWrite()
        {
            var list = FindCandidates();
            var md = FormatMarkdown(list);
            var path = HaemuKhsSailPaths.ComparisonFile(HaemuKhsSailPaths.FileCatalog);
            File.WriteAllText(path, md, new UTF8Encoding(false));
            Debug.Log("[Haemu] 돛 후보 " + list.Count + "개 → " + path + "\n" + md);

            if (list.Count == 0)
            {
                EditorUtility.DisplayDialog(
                    "돛 후보 없음",
                    "Assets 아래 문화재청 돛이 없습니다.\n\n" +
                    "1) Haemu/문화재청/Asset Store에서 통신사선 열기 (303453)\n" +
                    "2) 또는 로컬 .unitypackage 임포트\n\n" +
                    "digital.khs / 네이버 경로는 쓰지 마세요.",
                    "확인");
                return;
            }

            if (string.IsNullOrEmpty(HaemuKhsSailPaths.SelectedCandidateGuid))
                HaemuKhsSailPaths.SelectedCandidateGuid = list[0].Guid;
        }

        public static int CountUnder(IList<string> folderTokens)
        {
            var n = 0;
            foreach (var c in FindAllMeshAndPrefabPaths())
            {
                if (HaemuKhsSailPaths.PathContainsAny(c, folderTokens)) n++;
            }
            return n;
        }

        public static List<Candidate> FindCandidates()
        {
            var results = new List<Candidate>();
            foreach (var assetPath in FindAllMeshAndPrefabPaths())
            {
                if (HaemuKhsSailPaths.IsForbiddenPath(assetPath)) continue;

                var name = Path.GetFileNameWithoutExtension(assetPath);
                var kind = assetPath.EndsWith(".prefab", StringComparison.OrdinalIgnoreCase) ? "Prefab" : "Mesh";
                var score = Score(assetPath, name, kind, out var why);
                if (score <= 0) continue;

                var guid = AssetDatabase.AssetPathToGUID(assetPath);
                results.Add(new Candidate
                {
                    Guid = guid,
                    Path = assetPath,
                    Name = name,
                    Kind = kind,
                    Score = score,
                    Why = why,
                    PrimaryPackage = HaemuKhsSailPaths.PathContainsAny(assetPath, HaemuKhsSailPaths.PreferredFolderTokens),
                    SecondaryPackage = HaemuKhsSailPaths.PathContainsAny(assetPath, HaemuKhsSailPaths.SecondaryFolderTokens)
                });
            }

            return results.OrderByDescending(c => c.Score).ThenBy(c => c.Path, StringComparer.OrdinalIgnoreCase).ToList();
        }

        public static Candidate FindBest()
        {
            var guid = HaemuKhsSailPaths.SelectedCandidateGuid;
            var all = FindCandidates();
            if (!string.IsNullOrEmpty(guid))
            {
                var picked = all.FirstOrDefault(c => c.Guid == guid);
                if (picked != null) return picked;
            }
            var namedSail = all.FirstOrDefault(c =>
                HaemuKhsSailPaths.PathContainsAny(c.Name, HaemuKhsSailPaths.SailNameTokens));
            return namedSail ?? all.FirstOrDefault();
        }

        public static UnityEngine.Object Load(Candidate c)
        {
            if (c == null || string.IsNullOrEmpty(c.Path)) return null;
            if (c.Kind == "Prefab")
                return AssetDatabase.LoadAssetAtPath<GameObject>(c.Path);
            return AssetDatabase.LoadAssetAtPath<Mesh>(c.Path);
        }

        static int Score(string path, string name, string kind, out string why)
        {
            var reasons = new List<string>();
            var score = 0;
            var hay = (path + " " + name).ToLowerInvariant();

            if (HaemuKhsSailPaths.PathContainsAny(hay, HaemuKhsSailPaths.RejectNameTokens) &&
                !HaemuKhsSailPaths.PathContainsAny(name, HaemuKhsSailPaths.SailNameTokens))
            {
                why = "선체/갑판 등으로 제외";
                return 0;
            }

            if (HaemuKhsSailPaths.PathContainsAny(path, HaemuKhsSailPaths.PreferredFolderTokens))
            {
                score += 80;
                reasons.Add("PRIMARY 통신사선 폴더");
            }
            else if (HaemuKhsSailPaths.PathContainsAny(path, HaemuKhsSailPaths.SecondaryFolderTokens))
            {
                score += 25;
                reasons.Add("보조 해양유산 폴더");
            }
            else if (HaemuKhsSailPaths.PathContainsAny(path, HaemuKhsSailPaths.PublisherFolderTokens))
            {
                score += 10;
                reasons.Add("KHS 폴더");
            }
            else
            {
                why = "문화재청 패키지 폴더 밖";
                return 0;
            }

            if (HaemuKhsSailPaths.PathContainsAny(name, HaemuKhsSailPaths.SailNameTokens))
            {
                score += 100;
                reasons.Add("이름에 돛/sail");
            }
            else if (HaemuKhsSailPaths.PathContainsAny(name, HaemuKhsSailPaths.MastNameTokens))
            {
                score += 35;
                reasons.Add("이름에 돛대/mast — 자식 돛 추출 후보");
            }
            else if (HaemuKhsSailPaths.PathContainsAny(path, HaemuKhsSailPaths.ShipNameTokens) ||
                     hay.Contains("ship") || hay.Contains("선"))
            {
                score += 20;
                reasons.Add("선박 프리팹 — 자식 렌더러에서 돛 추출");
            }
            else
            {
                score -= 15;
                reasons.Add("돛 이름 없음");
            }

            if (kind == "Prefab")
            {
                score += 20;
                reasons.Add("프리팹");
            }

            why = string.Join(", ", reasons);
            return score;
        }

        static IEnumerable<string> FindAllMeshAndPrefabPaths()
        {
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var filter in new[] { "t:Mesh", "t:Prefab" })
            {
                foreach (var guid in AssetDatabase.FindAssets(filter, new[] { "Assets" }))
                {
                    var path = AssetDatabase.GUIDToAssetPath(guid);
                    if (string.IsNullOrEmpty(path) || !seen.Add(path)) continue;
                    if (path.IndexOf("/Haemu/", StringComparison.OrdinalIgnoreCase) >= 0) continue;
                    yield return path;
                }
            }
        }

        public static string FormatMarkdown(IList<Candidate> list)
        {
            var sb = new StringBuilder();
            sb.AppendLine("# tut01 포교선 — 문화재청 돛 후보");
            sb.AppendLine();
            sb.AppendLine("- 검색 범위: `Assets/` (digital.khs / 네이버 경로 제외)");
            sb.AppendLine("- PRIMARY: " + HaemuKhsSailPaths.PrimaryPackageName + " " + HaemuKhsSailPaths.PrimaryPackageId);
            sb.AppendLine("- 보조: " + HaemuKhsSailPaths.SecondaryPackageName + " " + HaemuKhsSailPaths.SecondaryPackageId);
            sb.AppendLine("- 개수: " + list.Count);
            sb.AppendLine();
            sb.AppendLine("| 점수 | 종류 | 이름 | 패키지 | 경로 | 이유 |");
            sb.AppendLine("|---:|---|---|---|---|---|");
            foreach (var c in list)
            {
                var pkg = c.PrimaryPackage ? "303453" : c.SecondaryPackage ? "271907" : "KHS";
                sb.Append("| ").Append(c.Score)
                    .Append(" | ").Append(c.Kind)
                    .Append(" | ").Append(c.Name)
                    .Append(" | ").Append(pkg)
                    .Append(" | `").Append(c.Path).Append("`")
                    .Append(" | ").Append(c.Why)
                    .AppendLine(" |");
            }

            if (list.Count == 0)
            {
                sb.AppendLine();
                sb.AppendLine("후보가 없으면 패키지가 아직 임포트되지 않은 것이다. kharma 303453 또는 .unitypackage.");
            }
            return sb.ToString();
        }
    }
}
