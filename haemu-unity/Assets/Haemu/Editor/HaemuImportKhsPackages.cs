using System.IO;
using System.Text;
using UnityEditor;
using UnityEngine;

namespace Haemu.Editor
{
    /// <summary>
    /// 문화재청 Asset Store 패키지(303453 / 271907)를 kharma·로컬 .unitypackage로 연다.
    /// digital.khs / 네이버에서 받지 않는다.
    /// </summary>
    public static class HaemuImportKhsPackages
    {
        const string MenuRoot = "Haemu/문화재청/";

        [MenuItem(MenuRoot + "Asset Store에서 통신사선 열기 (303453)", false, 20)]
        public static void OpenPrimaryStore()
        {
            Application.OpenURL(HaemuKhsSailPaths.KharmaPrimary);
            Application.OpenURL(HaemuKhsSailPaths.StorePrimary);
            Debug.Log("[Haemu] PRIMARY 통신사선 패키지 열기: kharma 303453 + Asset Store. digital.khs/네이버는 사용하지 않음.");
        }

        [MenuItem(MenuRoot + "Asset Store에서 해양유산 열기 (271907)", false, 21)]
        public static void OpenSecondaryStore()
        {
            Application.OpenURL(HaemuKhsSailPaths.KharmaSecondary);
            Application.OpenURL(HaemuKhsSailPaths.StoreSecondary);
            Debug.Log("[Haemu] 보조 해양유산 패키지 열기: kharma 271907 + Asset Store.");
        }

        [MenuItem(MenuRoot + "문화재청 퍼블리셔 페이지 열기 (86877)", false, 22)]
        public static void OpenPublisher()
        {
            Application.OpenURL(HaemuKhsSailPaths.StorePublisher);
        }

        [MenuItem(MenuRoot + "로컬 .unitypackage 임포트", false, 23)]
        public static void ImportLocalUnityPackage()
        {
            var start = Directory.Exists(HaemuKhsSailPaths.ProjectRoot)
                ? HaemuKhsSailPaths.ProjectRoot
                : "";
            var path = EditorUtility.OpenFilePanel(
                "문화재청 KHS .unitypackage (303453 우선)", start, "unitypackage");
            if (string.IsNullOrEmpty(path)) return;
            if (HaemuKhsSailPaths.IsForbiddenPath(path))
            {
                EditorUtility.DisplayDialog(
                    "경로 거부",
                    "digital.khs / 네이버 경로는 쓰지 않습니다.\nAsset Store에서 받은 .unitypackage만 고르세요.",
                    "확인");
                return;
            }

            AssetDatabase.importPackageCompleted -= OnPackageImported;
            AssetDatabase.importPackageCompleted += OnPackageImported;
            AssetDatabase.ImportPackage(path, true);
        }

        [MenuItem(MenuRoot + "패키지 임포트 상태 확인", false, 24)]
        public static void ReportImportStatus()
        {
            var status = BuildStatusMarkdown();
            File.WriteAllText(HaemuKhsSailPaths.ComparisonFile("tut01_포교선_패키지상태.md"), status, new UTF8Encoding(false));
            Debug.Log(status);
            EditorUtility.DisplayDialog("문화재청 패키지 상태", status, "확인");
        }

        static void OnPackageImported(string packageName)
        {
            AssetDatabase.importPackageCompleted -= OnPackageImported;
            Debug.Log("[Haemu] .unitypackage 임포트 완료: " + packageName + " → 돛 후보를 다시 찾습니다.");
            HaemuKhsSailCatalog.ListAndWrite();
        }

        public static bool PrimaryLooksImported()
        {
            return HaemuKhsSailCatalog.CountUnder(HaemuKhsSailPaths.PreferredFolderTokens) > 0;
        }

        public static bool SecondaryLooksImported()
        {
            return HaemuKhsSailCatalog.CountUnder(HaemuKhsSailPaths.SecondaryFolderTokens) > 0;
        }

        public static string BuildStatusMarkdown()
        {
            var sb = new StringBuilder();
            sb.AppendLine("# 문화재청 패키지 임포트 상태");
            sb.AppendLine();
            sb.AppendLine("- 퍼블리셔: " + HaemuKhsSailPaths.PublisherName + " (" + HaemuKhsSailPaths.PublisherId + ")");
            sb.AppendLine("- PRIMARY: " + HaemuKhsSailPaths.PrimaryPackageName + " (" + HaemuKhsSailPaths.PrimaryPackageId + ") → " +
                          (PrimaryLooksImported() ? "Assets 아래에서 발견" : "아직 없음"));
            sb.AppendLine("- 보조: " + HaemuKhsSailPaths.SecondaryPackageName + " (" + HaemuKhsSailPaths.SecondaryPackageId + ") → " +
                          (SecondaryLooksImported() ? "Assets 아래에서 발견" : "아직 없음"));
            sb.AppendLine("- 금지 경로: digital.khs, 네이버 — 검색에서 제외");
            sb.AppendLine();
            sb.AppendLine("없으면 `Haemu/문화재청/Asset Store에서 통신사선 열기 (303453)` 또는 로컬 .unitypackage 임포트.");
            return sb.ToString();
        }
    }
}
