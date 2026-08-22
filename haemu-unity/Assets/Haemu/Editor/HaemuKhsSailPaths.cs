using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;

namespace Haemu.Editor
{
    /// <summary>
    /// 문화재청(KOREA HERITAGE SERVICE, publisher 86877) 돛 이식 상수.
    /// digital.khs / 네이버 경로는 검색·다운로드 후보에서 제외한다.
    /// </summary>
    public static class HaemuKhsSailPaths
    {
        public const int PublisherId = 86877;
        public const int PrimaryPackageId = 303453;
        public const int SecondaryPackageId = 271907;

        public const string PublisherName = "KOREA HERITAGE SERVICE";
        public const string PrimaryPackageName = "KHS - JoseonTongsinsaseon";
        public const string SecondaryPackageName = "KHS - Korean Maritime Heritage";

        public const string KharmaPrimary = "com.unity3d.kharma:content/303453";
        public const string KharmaSecondary = "com.unity3d.kharma:content/271907";
        public const string StorePrimary = "https://assetstore.unity.com/packages/3d/props/khs-joseontongsinsaseon-303453";
        public const string StoreSecondary = "https://assetstore.unity.com/packages/3d/props/khs-korean-maritime-heritage-271907";
        public const string StorePublisher = "https://assetstore.unity.com/publishers/86877";

        /// <summary>로컬 승인된 절차형 돛 (세로 8× / 가로 1.5×). 5배 균일·가로만 확대는 폐기.</summary>
        public const float ApprovedHalfLength = 4.08f;
        public const float ApprovedClothDepth = 17.60f;
        public const float ApprovedLean = 7.84f;
        public const float ApprovedRipple = 1.28f;
        public const float RejectedUniformScale = 5f;

        public const string PrefUseKhsSail = "Haemu.Tut01.UseKhsSail";
        public const string PrefCandidateGuid = "Haemu.Tut01.KhsSailGuid";
        public const string PrefGenerateMenu = "Haemu.Tut01.GenerateAllMenu";

        public const string FileProceduralQuarter = "tut01_포교선_절차형돛_사분면.png";
        public const string FileProceduralSide = "tut01_포교선_절차형돛_측면.png";
        public const string FileKhsQuarter = "tut01_포교선_문화재청돛_사분면.png";
        public const string FileKhsSide = "tut01_포교선_문화재청돛_측면.png";
        public const string FileCatalog = "tut01_포교선_돛후보목록.md";
        public const string FileResult = "tut01_포교선_이식결과.md";
        public const string FileMemo = "사용메모.md";

        public static readonly string[] ForbiddenPathMarkers =
        {
            "digital.khs", "digital.khs.go.kr", "naver.com", "blog.naver", "pstatic", "/naver/"
        };

        public static readonly string[] PreferredFolderTokens =
        {
            "joseontongsinsaseon", "tongsinsa", "tongsinsaseon", "통신사",
            "303453", "khs - joseon", "khs-joseon"
        };

        public static readonly string[] SecondaryFolderTokens =
        {
            "korean maritime heritage", "maritimeheritage", "271907", "khs - korean maritime"
        };

        public static readonly string[] PublisherFolderTokens =
        {
            "khs", "korea heritage", "koreaheritageservice", "문화재청"
        };

        public static readonly string[] SailNameTokens =
        {
            "sail", "sails", "furled", "canvas", "clothsail",
            "돛", "돛폭", "돛창", "범포", "돛솔"
        };

        public static readonly string[] MastNameTokens =
        {
            "mast", "yard", "boom", "spar", "돛대", "활대", "이층돛대"
        };

        public static readonly string[] RejectNameTokens =
        {
            "hull", "deck", "keel", "rudder", "oar", "paddle", "anchor", "cabin",
            "선체", "갑판", "키", "노", "닻", "선실", "바닥"
        };

        public static readonly string[] ShipNameTokens =
        {
            "포교", "pogyeo", "pogyo", "tut01", "tutorialship", "missionship",
            "tongsinsa", "통신사", "포교선"
        };

        public static readonly string[] ExistingSailTokens =
        {
            "furledsail", "furled", "createsail", "sail", "돛"
        };

        public static bool IsForbiddenPath(string path)
        {
            if (string.IsNullOrEmpty(path)) return false;
            var lower = path.Replace('\\', '/').ToLowerInvariant();
            for (var i = 0; i < ForbiddenPathMarkers.Length; i++)
            {
                if (lower.Contains(ForbiddenPathMarkers[i])) return true;
            }
            return false;
        }

        public static bool PathContainsAny(string path, IList<string> tokens)
        {
            if (string.IsNullOrEmpty(path) || tokens == null) return false;
            var lower = path.Replace('\\', '/').ToLowerInvariant();
            for (var i = 0; i < tokens.Count; i++)
            {
                if (lower.Contains(tokens[i])) return true;
            }
            return false;
        }

        public static string ProjectRoot
        {
            get
            {
                var data = Application.dataPath;
                return string.IsNullOrEmpty(data)
                    ? Directory.GetCurrentDirectory()
                    : Directory.GetParent(data).FullName;
            }
        }

        /// <summary>프로젝트 루트 Artifacts/Comparison. 없으면 만든다.</summary>
        public static string ComparisonDir
        {
            get
            {
                var dir = Path.Combine(ProjectRoot, "Artifacts", "Comparison");
                Directory.CreateDirectory(dir);
                return dir;
            }
        }

        public static string ComparisonFile(string fileName)
        {
            return Path.Combine(ComparisonDir, fileName);
        }

        public static bool UseKhsSail
        {
            get => EditorPrefs.GetBool(PrefUseKhsSail, false);
            set => EditorPrefs.SetBool(PrefUseKhsSail, value);
        }

        public static string SelectedCandidateGuid
        {
            get => EditorPrefs.GetString(PrefCandidateGuid, string.Empty);
            set => EditorPrefs.SetString(PrefCandidateGuid, value ?? string.Empty);
        }
    }
}
