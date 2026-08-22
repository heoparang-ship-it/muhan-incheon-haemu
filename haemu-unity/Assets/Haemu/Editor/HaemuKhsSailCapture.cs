using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using UnityEditor;
using UnityEngine;

namespace Haemu.Editor
{
    /// <summary>
    /// GenerateAllAndCapture 경로와 맞춘 비교 캡처.
    /// 산출: Artifacts/Comparison, 파일명 한글.
    /// </summary>
    public static class HaemuKhsSailCapture
    {
        const string MenuRoot = "Haemu/문화재청/";
        const int Width = 1920;
        const int Height = 1080;

        [MenuItem(MenuRoot + "tut01 포교선 — 문화재청 돛 이식하고 재생성", false, 0)]
        public static void TransplantAndRegenerate()
        {
            RunPipeline(true);
        }

        [MenuItem(MenuRoot + "tut01에 돛만 이식 (재생성 없이)", false, 41)]
        public static void GraftOnly()
        {
            HaemuKhsSailPaths.UseKhsSail = true;
            var report = HaemuKhsSailGraft.ApplyToTut01();
            if (!report.Ok)
            {
                EditorUtility.DisplayDialog("이식 실패", report.Message, "확인");
                return;
            }
            CaptureShip(report.Ship, HaemuKhsSailPaths.FileKhsQuarter, HaemuKhsSailPaths.FileKhsSide);
            WriteResult(report, generated: false);
            EditorUtility.DisplayDialog("이식 완료", report.Message + "\n캡처: Artifacts/Comparison", "확인");
        }

        [MenuItem(MenuRoot + "비교 캡처만 (현재 씬)", false, 42)]
        public static void CaptureCurrent()
        {
            var ship = HaemuKhsSailGraft.FindTut01Ship();
            if (ship == null)
            {
                EditorUtility.DisplayDialog("배 없음", "tut01 포교선을 찾지 못했다.", "확인");
                return;
            }
            var khs = ship.GetComponentsInChildren<Transform>(true)
                .Any(t => t.name.StartsWith(HaemuKhsSailGraft.GraftedName, StringComparison.Ordinal));
            if (khs)
                CaptureShip(ship, HaemuKhsSailPaths.FileKhsQuarter, HaemuKhsSailPaths.FileKhsSide);
            else
                CaptureShip(ship, HaemuKhsSailPaths.FileProceduralQuarter, HaemuKhsSailPaths.FileProceduralSide);
            EditorUtility.RevealInFinder(HaemuKhsSailPaths.ComparisonDir);
        }

        [MenuItem(MenuRoot + "절차형 돛으로 되돌리기", false, 60)]
        public static void RestoreProcedural()
        {
            HaemuKhsSailPaths.UseKhsSail = false;
            var ship = HaemuKhsSailGraft.FindTut01Ship();
            if (ship == null)
            {
                EditorUtility.DisplayDialog("배 없음", "씬에서 포교선을 찾지 못했다. GenerateAll을 먼저 실행.", "확인");
                return;
            }

            foreach (var t in ship.GetComponentsInChildren<Transform>(true).ToArray())
            {
                if (t != null && t.gameObject.name.StartsWith(HaemuKhsSailGraft.GraftedName, StringComparison.Ordinal))
                    Undo.DestroyObjectImmediate(t.gameObject);
            }

            var restored = 0;
            foreach (var t in ship.GetComponentsInChildren<Transform>(true))
            {
                if (t == null || !t.gameObject.name.Contains(HaemuKhsSailGraft.ArchivedSuffix)) continue;
                Undo.RecordObject(t.gameObject, "절차형 돛 복구");
                t.gameObject.SetActive(true);
                t.gameObject.name = t.gameObject.name.Replace(HaemuKhsSailGraft.ArchivedSuffix, "");
                restored++;
            }

            EditorUtility.DisplayDialog("되돌림", "문화재청 돛 제거. 절차형 복구 " + restored + "개.", "확인");
        }

        public static void RunPipeline(bool showDialog)
        {
            HaemuKhsSailCatalog.ListAndWrite();
            if (HaemuKhsSailCatalog.FindBest() == null)
            {
                if (showDialog)
                {
                    EditorUtility.DisplayDialog(
                        "패키지 없음",
                        "문화재청 돛이 Assets에 없습니다.\n\n한 줄: Haemu/문화재청/Asset Store에서 통신사선 열기 (303453)\n또는 로컬 .unitypackage 임포트 후 이 메뉴를 다시 누르세요.",
                        "확인");
                }
                return;
            }

            HaemuKhsSailPaths.UseKhsSail = false;
            var generated = TryGenerateAll();
            var ship = HaemuKhsSailGraft.FindTut01Ship();
            if (ship != null)
                CaptureShip(ship, HaemuKhsSailPaths.FileProceduralQuarter, HaemuKhsSailPaths.FileProceduralSide);

            HaemuKhsSailPaths.UseKhsSail = true;
            var report = HaemuKhsSailGraft.ApplyToTut01();
            if (report.Ok && report.Ship != null)
                CaptureShip(report.Ship, HaemuKhsSailPaths.FileKhsQuarter, HaemuKhsSailPaths.FileKhsSide);

            WriteResult(report, generated);
            if (showDialog)
            {
                EditorUtility.DisplayDialog(
                    report.Ok ? "이식·비교 완료" : "이식 실패",
                    report.Message + "\n산출: Artifacts/Comparison\nGenerateAllAndCapture: " + (generated ? "호출함" : "메뉴 없음(씬 객체에 직접 이식)"),
                    "확인");
                EditorUtility.RevealInFinder(HaemuKhsSailPaths.ComparisonDir);
            }
        }

        public static bool TryGenerateAll()
        {
            var remembered = EditorPrefs.GetString(HaemuKhsSailPaths.PrefGenerateMenu, string.Empty);
            if (!string.IsNullOrEmpty(remembered) && EditorApplication.ExecuteMenuItem(remembered))
                return true;

            foreach (var menu in DiscoverGenerateMenus())
            {
                try
                {
                    if (EditorApplication.ExecuteMenuItem(menu))
                    {
                        EditorPrefs.SetString(HaemuKhsSailPaths.PrefGenerateMenu, menu);
                        Debug.Log("[Haemu] GenerateAllAndCapture 메뉴 호출: " + menu);
                        return true;
                    }
                }
                catch (Exception e)
                {
                    Debug.LogWarning("[Haemu] 메뉴 실패 " + menu + ": " + e.Message);
                }
            }

            if (TryInvokeGenerateMethod())
                return true;

            Debug.LogWarning("[Haemu] GenerateAllAndCapture를 찾지 못했다. 현재 씬의 포교선에 직접 이식한다.");
            return false;
        }

        static System.Collections.Generic.IEnumerable<string> DiscoverGenerateMenus()
        {
            var seen = new System.Collections.Generic.HashSet<string>();
            foreach (var guess in new[]
                     {
                         "Haemu/Generate All And Capture",
                         "Haemu/GenerateAllAndCapture",
                         "Haemu/튜토리얼/전부 생성하고 캡처",
                         "Haemu/tut01/Generate All And Capture",
                         "Haemu/Tutorial/Generate All And Capture"
                     })
            {
                if (seen.Add(guess)) yield return guess;
            }

            foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
            {
                Type[] types;
                try { types = asm.GetTypes(); }
                catch { continue; }

                foreach (var t in types)
                {
                    MethodInfo[] methods;
                    try
                    {
                        methods = t.GetMethods(BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
                    }
                    catch { continue; }

                    foreach (var m in methods)
                    {
                        object[] attrs;
                        try { attrs = m.GetCustomAttributes(typeof(MenuItem), false); }
                        catch { continue; }
                        foreach (MenuItem item in attrs)
                        {
                            var path = item.menuItem;
                            if (string.IsNullOrEmpty(path) || path.StartsWith("CONTEXT/", StringComparison.Ordinal))
                                continue;
                            var hit = path.IndexOf("GenerateAllAndCapture", StringComparison.OrdinalIgnoreCase) >= 0
                                      || path.IndexOf("Generate All And Capture", StringComparison.OrdinalIgnoreCase) >= 0
                                      || (path.IndexOf("생성", StringComparison.Ordinal) >= 0 &&
                                          path.IndexOf("캡처", StringComparison.Ordinal) >= 0);
                            if (hit && seen.Add(path))
                                yield return path;
                        }
                    }
                }
            }
        }

        static bool TryInvokeGenerateMethod()
        {
            foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
            {
                Type[] types;
                try { types = asm.GetTypes(); }
                catch { continue; }
                foreach (var t in types)
                {
                    MethodInfo[] methods;
                    try
                    {
                        methods = t.GetMethods(BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
                    }
                    catch { continue; }
                    foreach (var m in methods)
                    {
                        if (m.GetParameters().Length != 0) continue;
                        var n = m.Name;
                        if (n.IndexOf("GenerateAllAndCapture", StringComparison.OrdinalIgnoreCase) < 0 &&
                            !(n.IndexOf("GenerateAll", StringComparison.OrdinalIgnoreCase) >= 0 &&
                              n.IndexOf("Capture", StringComparison.OrdinalIgnoreCase) >= 0))
                            continue;
                        try
                        {
                            m.Invoke(null, null);
                            Debug.Log("[Haemu] 메서드 호출: " + t.FullName + "." + n);
                            return true;
                        }
                        catch (Exception e)
                        {
                            Debug.LogWarning("[Haemu] " + n + " 실패: " + e.Message);
                        }
                    }
                }
            }
            return false;
        }

        public static void CaptureShip(GameObject ship, string quarterFile, string sideFile)
        {
            if (ship == null) return;
            var focus = HaemuKhsSailGraft.CombinedBounds(new[] { ship });
            if (focus.size.sqrMagnitude < 0.0001f)
                focus = new Bounds(ship.transform.position, Vector3.one * 8f);

            WritePng(focus, quarterFile, new Vector3(0.95f, 0.48f, -0.82f));
            WritePng(focus, sideFile, new Vector3(0.05f, 0.38f, -1.2f));
        }

        static void WritePng(Bounds focus, string fileName, Vector3 dir)
        {
            var radius = Mathf.Max(4f, focus.size.magnitude * 0.85f);
            var camGo = new GameObject("_HaemuCompareCam") { hideFlags = HideFlags.HideAndDontSave };
            var cam = camGo.AddComponent<Camera>();
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0.55f, 0.68f, 0.78f, 1f);
            cam.nearClipPlane = 0.05f;
            cam.farClipPlane = Mathf.Max(200f, radius * 8f);
            cam.fieldOfView = 38f;
            cam.allowHDR = false;
            cam.allowMSAA = false;
            cam.transform.position = focus.center + dir.normalized * radius;
            cam.transform.LookAt(focus.center);

            var lightGo = new GameObject("_HaemuCompareLight") { hideFlags = HideFlags.HideAndDontSave };
            var light = lightGo.AddComponent<Light>();
            light.type = LightType.Directional;
            light.intensity = 1.1f;
            light.transform.rotation = Quaternion.Euler(42f, -35f, 0f);

            var rt = new RenderTexture(Width, Height, 24, RenderTextureFormat.ARGB32);
            cam.targetTexture = rt;
            cam.Render();
            var prev = RenderTexture.active;
            RenderTexture.active = rt;
            var tex = new Texture2D(Width, Height, TextureFormat.RGB24, false);
            tex.ReadPixels(new Rect(0, 0, Width, Height), 0, 0);
            tex.Apply();
            RenderTexture.active = prev;

            var path = HaemuKhsSailPaths.ComparisonFile(fileName);
            File.WriteAllBytes(path, tex.EncodeToPNG());
            Debug.Log("[Haemu] 캡처 " + path);

            cam.targetTexture = null;
            UnityEngine.Object.DestroyImmediate(tex);
            UnityEngine.Object.DestroyImmediate(rt);
            UnityEngine.Object.DestroyImmediate(lightGo);
            UnityEngine.Object.DestroyImmediate(camGo);
        }

        public static void WriteResult(HaemuKhsSailGraft.Report report, bool generated)
        {
            var sb = new StringBuilder();
            sb.AppendLine("# tut01 포교선 — 문화재청 돛 이식 결과");
            sb.AppendLine();
            sb.AppendLine("- 시각: " + DateTime.Now.ToString("yyyy-MM-dd HH:mm"));
            sb.AppendLine("- 성공: " + (report != null && report.Ok ? "예" : "아니오"));
            sb.AppendLine("- 메시지: " + (report != null ? report.Message : "없음"));
            sb.AppendLine("- 소스: `" + (report != null ? report.SourcePath : "") + "`");
            sb.AppendLine("- GUID: " + (report != null ? report.SourceGuid : ""));
            sb.AppendLine("- 패키지: " + (report != null ? report.PackageTag : ""));
            sb.AppendLine("- 배: " + (report != null && report.Ship != null ? report.Ship.name : "없음"));
            sb.AppendLine("- 이식 장수: " + (report != null ? report.Grafted.Count.ToString() : "0"));
            sb.AppendLine("- 보관한 절차형: " + (report != null ? string.Join(", ", report.Archived) : ""));
            sb.AppendLine("- GenerateAllAndCapture: " + (generated ? "호출함" : "없음(직접 이식)"));
            sb.AppendLine();
            sb.AppendLine("## 스케일 검증 (폐기안 재사용 금지)");
            if (report != null)
            {
                sb.AppendLine("- 균일비: " + report.UniformScale.ToString("0.####"));
                sb.AppendLine("- localScale: " + report.AppliedScale);
                sb.AppendLine("- 목표 크기(기존 돛 또는 승인 clothDepth): " + report.TargetSize);
                sb.AppendLine("- 결과 크기: " + report.ResultSize);
                var uniform = Mathf.Abs(report.AppliedScale.x - report.AppliedScale.y) < 0.01f &&
                              Mathf.Abs(report.AppliedScale.y - report.AppliedScale.z) < 0.01f;
                sb.AppendLine("- 가로만 확대: " + (uniform ? "아니오" : "경고 — xyz가 다름"));
                sb.AppendLine("- 5배 균일 고정: " +
                              (Mathf.Abs(report.UniformScale - HaemuKhsSailPaths.RejectedUniformScale) < 0.05f
                                  ? "경고 — 5배에 가까움"
                                  : "아니오"));
            }
            sb.AppendLine();
            sb.AppendLine("## 가설 검증");
            sb.AppendLine("- 패키지 미임포트: " + (HaemuKhsSailCatalog.FindBest() == null ? "맞음 — 후보 0" : "아님 — 후보 있음"));
            sb.AppendLine("- PRIMARY 303453: " + (HaemuImportKhsPackages.PrimaryLooksImported() ? "Assets에서 발견" : "없음"));
            sb.AppendLine("- 보조 271907: " + (HaemuImportKhsPackages.SecondaryLooksImported() ? "Assets에서 발견" : "없음"));
            sb.AppendLine("- 금지 경로 사용: 아니오 (digital.khs / 네이버 검색 제외)");
            if (report != null)
            {
                foreach (var n in report.Notes)
                    sb.AppendLine("- 메모: " + n);
            }
            sb.AppendLine();
            sb.AppendLine("## 비교 파일");
            sb.AppendLine("- `" + HaemuKhsSailPaths.FileProceduralQuarter + "`");
            sb.AppendLine("- `" + HaemuKhsSailPaths.FileProceduralSide + "`");
            sb.AppendLine("- `" + HaemuKhsSailPaths.FileKhsQuarter + "`");
            sb.AppendLine("- `" + HaemuKhsSailPaths.FileKhsSide + "`");
            sb.AppendLine("- `" + HaemuKhsSailPaths.FileCatalog + "`");
            File.WriteAllText(HaemuKhsSailPaths.ComparisonFile(HaemuKhsSailPaths.FileResult), sb.ToString(), new UTF8Encoding(false));
        }
    }
}
