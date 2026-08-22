using System.Linq;
using UnityEditor;
using UnityEngine;

namespace Haemu.Editor
{
    /// <summary>문화재청 돛 후보를 고르고 한 메뉴로 이식·재생성한다.</summary>
    public sealed class HaemuKhsSailWindow : EditorWindow
    {
        Vector2 _scroll;
        HaemuKhsSailCatalog.Candidate[] _list = new HaemuKhsSailCatalog.Candidate[0];

        [MenuItem("Haemu/문화재청/돛 작업 창", false, 1)]
        public static void Open()
        {
            var w = GetWindow<HaemuKhsSailWindow>("문화재청 돛");
            w.minSize = new Vector2(420, 320);
            w.Refresh();
        }

        void OnEnable() => Refresh();

        void Refresh()
        {
            _list = HaemuKhsSailCatalog.FindCandidates().ToArray();
        }

        void OnGUI()
        {
            EditorGUILayout.LabelField("tut01 포교선 ← 문화재청 돛", EditorStyles.boldLabel);
            EditorGUILayout.HelpBox(
                "대표·똑팀장: 패키지가 있으면 아래 빨간 버튼을 한 번만 누르면 된다.\n" +
                "PRIMARY 303453 (JoseonTongsinsaseon). digital.khs / 네이버 사용 금지.",
                MessageType.Info);

            EditorGUILayout.LabelField("303453 통신사선", HaemuImportKhsPackages.PrimaryLooksImported() ? "임포트됨" : "없음");
            EditorGUILayout.LabelField("271907 해양유산", HaemuImportKhsPackages.SecondaryLooksImported() ? "임포트됨" : "없음");

            EditorGUILayout.Space();
            if (GUILayout.Button("Asset Store에서 통신사선 열기 (303453)", GUILayout.Height(28)))
                HaemuImportKhsPackages.OpenPrimaryStore();
            if (GUILayout.Button("로컬 .unitypackage 임포트", GUILayout.Height(24)))
                HaemuImportKhsPackages.ImportLocalUnityPackage();

            EditorGUILayout.Space();
            var old = GUI.backgroundColor;
            GUI.backgroundColor = new Color(0.85f, 0.35f, 0.3f);
            if (GUILayout.Button("tut01 포교선 — 문화재청 돛 이식하고 재생성", GUILayout.Height(36)))
                HaemuKhsSailCapture.TransplantAndRegenerate();
            GUI.backgroundColor = old;

            EditorGUILayout.Space();
            EditorGUILayout.BeginHorizontal();
            if (GUILayout.Button("후보 다시 찾기")) Refresh();
            if (GUILayout.Button("목록을 Artifacts에 쓰기")) HaemuKhsSailCatalog.ListAndWrite();
            EditorGUILayout.EndHorizontal();

            _scroll = EditorGUILayout.BeginScrollView(_scroll);
            if (_list.Length == 0)
                EditorGUILayout.HelpBox("후보 없음. 303453을 임포트하세요.", MessageType.Warning);
            foreach (var c in _list)
            {
                var picked = c.Guid == HaemuKhsSailPaths.SelectedCandidateGuid;
                EditorGUILayout.BeginHorizontal();
                if (GUILayout.Toggle(picked, "", GUILayout.Width(20)) && !picked)
                    HaemuKhsSailPaths.SelectedCandidateGuid = c.Guid;
                EditorGUILayout.LabelField(c.Score + "  " + c.Kind + "  " + c.Name, EditorStyles.miniLabel);
                EditorGUILayout.EndHorizontal();
                EditorGUILayout.LabelField(c.Path, EditorStyles.miniLabel);
            }
            EditorGUILayout.EndScrollView();
        }
    }
}
