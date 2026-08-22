using System;
using System.Collections.Generic;
using System.Linq;
using UnityEditor;
using UnityEngine;

namespace Haemu.Editor
{
    /// <summary>
    /// 문화재청 돛을 tut01 포교선에 이식한다. CreateFurledSail 대체 또는 생성 후 교체.
    /// 스케일은 균일만 허용한다. 5배 고정·가로만 확대는 거부한다.
    /// </summary>
    public static class HaemuKhsSailGraft
    {
        public const string GraftedName = "문화재청돛";
        public const string ArchivedSuffix = "_절차형_보관";

        public sealed class Report
        {
            public bool Ok;
            public string Message;
            public string SourcePath;
            public string SourceGuid;
            public string PackageTag;
            public GameObject Ship;
            public readonly List<GameObject> Grafted = new List<GameObject>();
            public readonly List<string> Archived = new List<string>();
            public readonly List<string> Notes = new List<string>();
            public float UniformScale = 1f;
            public Vector3 AppliedScale = Vector3.one;
            public Vector3 TargetSize;
            public Vector3 ResultSize;
        }

        /// <summary>
        /// CreateFurledSail 맨 위 한 줄:
        /// if (HaemuKhsSailSource.TryCreate(parent, halfLength, clothDepth, out var khs)) return khs;
        /// </summary>
        public static bool TryCreate(Transform parent, float halfLength, float clothDepth, out GameObject sail)
        {
            return HaemuKhsSailSource.TryCreate(parent, halfLength, clothDepth, out sail);
        }

        public static Report ApplyToTut01()
        {
            var report = new Report();
            var candidate = HaemuKhsSailCatalog.FindBest();
            if (candidate == null)
            {
                report.Message = "문화재청 돛 후보가 없다. 303453을 임포트한 뒤 다시 실행.";
                Debug.LogWarning("[Haemu] " + report.Message);
                return report;
            }

            report.SourcePath = candidate.Path;
            report.SourceGuid = candidate.Guid;
            report.PackageTag = candidate.PrimaryPackage ? "303453" : candidate.SecondaryPackage ? "271907" : "KHS";

            var ship = FindTut01Ship();
            report.Ship = ship;
            if (ship == null)
            {
                report.Message = "tut01 포교선을 씬에서 찾지 못했다. GenerateAll 이후 다시 실행하거나 배를 선택.";
                Debug.LogWarning("[Haemu] " + report.Message);
                return report;
            }

            var slots = FindExistingSails(ship);
            var targetHeight = HaemuKhsSailPaths.ApprovedClothDepth;
            var targetWidth = HaemuKhsSailPaths.ApprovedHalfLength * 2f;
            if (slots.Count > 0)
            {
                var b = CombinedBounds(slots);
                if (b.size.y > 0.01f) targetHeight = b.size.y;
                if (b.size.x > 0.01f || b.size.z > 0.01f)
                    targetWidth = Mathf.Max(b.size.x, b.size.z);
            }
            report.TargetSize = new Vector3(targetWidth, targetHeight, targetWidth);

            var pieces = ExtractSailPieces(candidate);
            if (pieces.Count == 0)
            {
                foreach (var other in HaemuKhsSailCatalog.FindCandidates())
                {
                    if (other.Guid == candidate.Guid) continue;
                    pieces = ExtractSailPieces(other);
                    if (pieces.Count == 0) continue;
                    report.Notes.Add("첫 후보에서 돛을 못 빼 " + other.Path + " 로 재시도");
                    candidate = other;
                    report.SourcePath = other.Path;
                    report.SourceGuid = other.Guid;
                    report.PackageTag = other.PrimaryPackage ? "303453" : other.SecondaryPackage ? "271907" : "KHS";
                    break;
                }
            }
            if (pieces.Count == 0)
            {
                report.Message = "후보에서 돛 렌더러를 추출하지 못했다. 결합 메시 가설 — 자식 이름에 sail/돛이 있는지 목록을 확인.";
                Debug.LogWarning("[Haemu] " + report.Message);
                return report;
            }

            ClearPreviousGrafts(ship);
            ArchiveProceduralSails(ship, slots, report);

            var parent = FindMastParent(ship) ?? ship.transform;
            pieces.Sort((a, b) => WorldCenterY(a).CompareTo(WorldCenterY(b)));
            slots.Sort((a, b) => a.transform.position.y.CompareTo(b.transform.position.y));

            var scales = new List<float>();
            for (var i = 0; i < pieces.Count; i++)
            {
                var src = pieces[i];
                var slot = i < slots.Count ? slots[i] : (slots.Count > 0 ? slots[slots.Count - 1] : null);
                var grafted = PlacePiece(src, parent, slot, targetHeight, report);
                if (grafted != null)
                {
                    report.Grafted.Add(grafted);
                    scales.Add(report.UniformScale);
                }
                else
                    UnityEngine.Object.DestroyImmediate(src);
            }

            if (report.Grafted.Count == 0)
            {
                report.Message = "이식 객체를 만들지 못했다.";
                return report;
            }

            report.ResultSize = CombinedBounds(report.Grafted).size;
            if (scales.Count > 0)
                report.UniformScale = scales[0];

            report.Ok = true;
            report.Message = "문화재청 돛 " + report.Grafted.Count + "장을 " + ship.name + "에 이식. 균일비 " +
                             report.UniformScale.ToString("0.###") + " (5배·가로단독 확대 없음)";
            Debug.Log("[Haemu] " + report.Message + " 소스=" + candidate.Path);
            return report;
        }

        /// <summary>CreateFurledSail 훅용. parent 아래에 문화재청 돛 한 장을 균일 스케일로 붙인다.</summary>
        public static GameObject CreateUnderParent(Transform parent, HaemuKhsSailCatalog.Candidate candidate, float targetHeight, Report report)
        {
            if (parent == null || candidate == null) return null;
            var pieces = ExtractSailPieces(candidate);
            if (pieces.Count == 0) return null;
            GameObject first = null;
            for (var i = 0; i < pieces.Count; i++)
            {
                var grafted = PlacePiece(pieces[i], parent, null, targetHeight, report ?? new Report());
                if (grafted != null && first == null) first = grafted;
                else if (grafted == null)
                    UnityEngine.Object.DestroyImmediate(pieces[i]);
            }
            return first;
        }

        static GameObject PlacePiece(GameObject src, Transform parent, GameObject slot, float targetHeight, Report report)
        {
            src.transform.SetParent(parent, true);
            var already = parent.GetComponentsInChildren<Transform>(true)
                .Count(t => t != src.transform && t.name.StartsWith(GraftedName, StringComparison.Ordinal));
            src.name = already == 0 ? GraftedName : GraftedName + "_" + (already + 1);

            Undo.RegisterCreatedObjectUndo(src, "문화재청 돛 이식");

            var srcBounds = CombinedBounds(new[] { src });
            var srcH = Mathf.Max(0.001f, srcBounds.size.y);
            var uniform = targetHeight / srcH;
            if (Mathf.Abs(uniform - HaemuKhsSailPaths.RejectedUniformScale) < 0.05f)
            {
                report.Notes.Add("계산비가 폐기된 5배에 가까워 1배로 두고 위치만 맞춤");
                uniform = 1f;
            }

            var ls = src.transform.localScale;
            if (Mathf.Abs(ls.x - ls.y) > 0.001f || Mathf.Abs(ls.y - ls.z) > 0.001f)
            {
                var m = (ls.x + ls.y + ls.z) / 3f;
                src.transform.localScale = new Vector3(m, m, m);
                report.Notes.Add("비균일 로컬스케일을 균일로 정규화");
            }

            src.transform.localScale *= uniform;
            report.UniformScale = src.transform.lossyScale.y;
            report.AppliedScale = src.transform.localScale;

            if (Mathf.Abs(report.AppliedScale.x - report.AppliedScale.y) > 0.001f ||
                Mathf.Abs(report.AppliedScale.y - report.AppliedScale.z) > 0.001f)
            {
                var m = (report.AppliedScale.x + report.AppliedScale.y + report.AppliedScale.z) / 3f;
                src.transform.localScale = new Vector3(m, m, m);
                report.AppliedScale = src.transform.localScale;
                report.Notes.Add("가로만 넓히는 스케일은 거부하고 xyz 동일하게 맞춤");
            }

            if (slot != null)
            {
                src.transform.position = slot.transform.position;
                src.transform.rotation = slot.transform.rotation;
            }
            else
            {
                src.transform.position = parent.position + Vector3.up * (targetHeight * 0.45f);
            }

            TryUpgradeBrokenMaterials(src);
            return src;
        }

        static List<GameObject> ExtractSailPieces(HaemuKhsSailCatalog.Candidate candidate)
        {
            var pieces = new List<GameObject>();
            var loaded = HaemuKhsSailCatalog.Load(candidate);
            if (loaded is Mesh mesh)
            {
                pieces.Add(MakeMeshObject(mesh, candidate.Name, FindMaterialNear(candidate.Path)));
                return pieces;
            }

            var prefab = loaded as GameObject;
            if (prefab == null) return pieces;

            var temp = PrefabUtility.InstantiatePrefab(prefab) as GameObject;
            if (temp == null) temp = UnityEngine.Object.Instantiate(prefab);
            temp.hideFlags = HideFlags.HideAndDontSave;
            temp.transform.position = new Vector3(0f, -10000f, 0f);
            temp.SetActive(true);

            var renderers = temp.GetComponentsInChildren<Renderer>(true);
            var sailLike = new List<Renderer>();
            foreach (var r in renderers)
            {
                if (r == null) continue;
                var n = r.gameObject.name;
                if (HaemuKhsSailPaths.PathContainsAny(n, HaemuKhsSailPaths.RejectNameTokens) &&
                    !HaemuKhsSailPaths.PathContainsAny(n, HaemuKhsSailPaths.SailNameTokens))
                    continue;
                if (HaemuKhsSailPaths.PathContainsAny(n, HaemuKhsSailPaths.SailNameTokens) ||
                    HaemuKhsSailPaths.PathContainsAny(n, HaemuKhsSailPaths.MastNameTokens))
                    sailLike.Add(r);
            }

            var shipB = CombinedBounds(new[] { temp });
            var shipVol = Mathf.Max(0.0001f, shipB.size.x * shipB.size.y * shipB.size.z);
            if (sailLike.Count == 0)
            {
                foreach (var r in renderers)
                {
                    if (r == null) continue;
                    var vol = r.bounds.size.x * r.bounds.size.y * r.bounds.size.z;
                    if (vol / shipVol > 0.8f) continue;
                    var tall = r.bounds.size.y > Mathf.Max(r.bounds.size.x, r.bounds.size.z) * 0.7f;
                    var high = r.bounds.center.y > shipB.min.y + shipB.size.y * 0.3f;
                    if (tall && high) sailLike.Add(r);
                }
            }

            sailLike = sailLike.Where(r =>
            {
                if (r == null) return false;
                if (HaemuKhsSailPaths.PathContainsAny(r.gameObject.name, HaemuKhsSailPaths.SailNameTokens))
                    return true;
                var vol = r.bounds.size.x * r.bounds.size.y * r.bounds.size.z;
                return vol / shipVol < 0.8f;
            }).ToList();

            foreach (var r in sailLike.Distinct())
            {
                var clone = UnityEngine.Object.Instantiate(r.gameObject);
                clone.SetActive(true);
                clone.hideFlags = HideFlags.None;
                UnparentKeepWorld(clone);
                StripNonVisual(clone);
                pieces.Add(clone);
            }

            UnityEngine.Object.DestroyImmediate(temp);
            return pieces;
        }

        static GameObject MakeMeshObject(Mesh mesh, string meshName, Material mat)
        {
            var go = new GameObject(string.IsNullOrEmpty(meshName) ? GraftedName : GraftedName + "_" + meshName);
            var mf = go.AddComponent<MeshFilter>();
            mf.sharedMesh = mesh;
            var mr = go.AddComponent<MeshRenderer>();
            if (mat != null) mr.sharedMaterial = mat;
            return go;
        }

        static Material FindMaterialNear(string meshPath)
        {
            var dir = System.IO.Path.GetDirectoryName(meshPath);
            if (string.IsNullOrEmpty(dir)) return null;
            var mats = AssetDatabase.FindAssets("t:Material", new[] { dir.Replace('\\', '/') });
            foreach (var guid in mats)
            {
                var p = AssetDatabase.GUIDToAssetPath(guid);
                if (HaemuKhsSailPaths.PathContainsAny(p, HaemuKhsSailPaths.SailNameTokens))
                    return AssetDatabase.LoadAssetAtPath<Material>(p);
            }
            if (mats.Length > 0)
                return AssetDatabase.LoadAssetAtPath<Material>(AssetDatabase.GUIDToAssetPath(mats[0]));
            return null;
        }

        static void UnparentKeepWorld(GameObject go)
        {
            go.transform.SetParent(null, true);
        }

        static void StripNonVisual(GameObject go)
        {
            foreach (var c in go.GetComponentsInChildren<Component>(true))
            {
                if (c == null || c is Transform || c is Renderer || c is MeshFilter || c is MeshRenderer)
                    continue;
                UnityEngine.Object.DestroyImmediate(c);
            }
        }

        static void TryUpgradeBrokenMaterials(GameObject go)
        {
            var urp = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Universal Render Pipeline/Simple Lit");
            if (urp == null) return;
            foreach (var r in go.GetComponentsInChildren<Renderer>(true))
            {
                var mats = r.sharedMaterials;
                var changed = false;
                for (var i = 0; i < mats.Length; i++)
                {
                    var m = mats[i];
                    if (m == null) continue;
                    if (m.shader != null && m.shader.name != "Hidden/InternalErrorShader") continue;
                    var tex = m.mainTexture;
                    var copy = new Material(urp) { name = m.name + "_URP" };
                    if (copy.HasProperty("_BaseMap") && tex != null) copy.SetTexture("_BaseMap", tex);
                    if (tex != null) copy.mainTexture = tex;
                    mats[i] = copy;
                    changed = true;
                }
                if (changed) r.sharedMaterials = mats;
            }
        }

        static void ClearPreviousGrafts(GameObject ship)
        {
            var victims = new List<GameObject>();
            foreach (var t in ship.GetComponentsInChildren<Transform>(true))
            {
                if (t != null && t.gameObject.name.StartsWith(GraftedName, StringComparison.Ordinal))
                    victims.Add(t.gameObject);
            }
            foreach (var v in victims)
                Undo.DestroyObjectImmediate(v);
        }

        static void ArchiveProceduralSails(GameObject ship, List<GameObject> slots, Report report)
        {
            foreach (var sail in slots)
            {
                if (sail == null) continue;
                if (sail.name.StartsWith(GraftedName, StringComparison.Ordinal)) continue;
                Undo.RecordObject(sail, "절차형 돛 보관");
                if (!sail.name.Contains(ArchivedSuffix))
                    sail.name += ArchivedSuffix;
                sail.SetActive(false);
                report.Archived.Add(sail.name);
            }
        }

        public static GameObject FindTut01Ship()
        {
            if (Selection.activeGameObject != null && LooksLikeShip(Selection.activeGameObject))
                return Selection.activeGameObject;

            GameObject best = null;
            var bestScore = 0;
            foreach (var t in UnityEngine.Object.FindObjectsByType<Transform>(FindObjectsInactive.Include, FindObjectsSortMode.None))
            {
                if (t == null || t.parent != null) continue;
                var s = ScoreShip(t.gameObject);
                if (s > bestScore)
                {
                    bestScore = s;
                    best = t.gameObject;
                }
            }

            if (best != null && bestScore >= 20) return best;

            foreach (var t in UnityEngine.Object.FindObjectsByType<Transform>(FindObjectsInactive.Include, FindObjectsSortMode.None))
            {
                if (t == null) continue;
                if (LooksLikeShip(t.gameObject)) return t.gameObject;
            }
            return best;
        }

        static bool LooksLikeShip(GameObject go)
        {
            return ScoreShip(go) >= 20;
        }

        static int ScoreShip(GameObject go)
        {
            if (go == null) return 0;
            var n = go.name;
            var s = 0;
            if (HaemuKhsSailPaths.PathContainsAny(n, HaemuKhsSailPaths.ShipNameTokens)) s += 50;
            if (n.IndexOf("tut01", StringComparison.OrdinalIgnoreCase) >= 0) s += 40;
            if (FindExistingSails(go).Count > 0) s += 20;
            if (FindMastParent(go) != null) s += 15;
            return s;
        }

        public static List<GameObject> FindExistingSails(GameObject ship)
        {
            var list = new List<GameObject>();
            if (ship == null) return list;
            foreach (var t in ship.GetComponentsInChildren<Transform>(true))
            {
                if (t == null || t.gameObject == ship) continue;
                if (t.gameObject.name.StartsWith(GraftedName, StringComparison.Ordinal)) continue;
                var n = t.gameObject.name;
                if (HaemuKhsSailPaths.PathContainsAny(n, HaemuKhsSailPaths.ExistingSailTokens) ||
                    n.IndexOf("FurledSail", StringComparison.OrdinalIgnoreCase) >= 0)
                    list.Add(t.gameObject);
            }
            return list.Distinct().ToList();
        }

        static Transform FindMastParent(GameObject ship)
        {
            if (ship == null) return null;
            foreach (var t in ship.GetComponentsInChildren<Transform>(true))
            {
                if (t == null) continue;
                if (HaemuKhsSailPaths.PathContainsAny(t.name, HaemuKhsSailPaths.MastNameTokens))
                    return t;
            }
            return null;
        }

        public static Bounds CombinedBounds(IEnumerable<GameObject> objects)
        {
            var has = false;
            var b = new Bounds(Vector3.zero, Vector3.zero);
            foreach (var go in objects)
            {
                if (go == null) continue;
                foreach (var r in go.GetComponentsInChildren<Renderer>(true))
                {
                    if (r == null) continue;
                    if (!has)
                    {
                        b = r.bounds;
                        has = true;
                    }
                    else b.Encapsulate(r.bounds);
                }
            }
            if (!has)
            {
                foreach (var go in objects)
                {
                    if (go == null) continue;
                    if (!has)
                    {
                        b = new Bounds(go.transform.position, Vector3.one);
                        has = true;
                    }
                    else b.Encapsulate(go.transform.position);
                }
            }
            return b;
        }

        static float WorldCenterY(GameObject go)
        {
            return CombinedBounds(new[] { go }).center.y;
        }
    }

    /// <summary>CreateFurledSail에서 호출하는 공개 훅.</summary>
    public static class HaemuKhsSailSource
    {
        public static bool TryCreate(Transform parent, float halfLength, float clothDepth, out GameObject sail)
        {
            sail = null;
            if (!HaemuKhsSailPaths.UseKhsSail) return false;
            var candidate = HaemuKhsSailCatalog.FindBest();
            if (candidate == null || parent == null) return false;

            var targetH = clothDepth > 0.01f ? clothDepth : HaemuKhsSailPaths.ApprovedClothDepth;
            var report = new HaemuKhsSailGraft.Report
            {
                SourcePath = candidate.Path,
                SourceGuid = candidate.Guid
            };
            sail = HaemuKhsSailGraft.CreateUnderParent(parent, candidate, targetH, report);
            _ = halfLength;
            return sail != null;
        }
    }
}
