package main

import (
	"archive/zip"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

var checkOnly = flag.Bool("check", false, "vérifie et télécharge Node.js uniquement, sans lancer le jeu")

func pause() {
	fmt.Println("Appuyez sur Entrée pour fermer...")
	fmt.Scanln()
}

func trouverNode(base string) string {
	if p, err := exec.LookPath("node"); err == nil {
		return p
	}
	local := filepath.Join(base, "node-runtime", "node.exe")
	if runtime.GOOS != "windows" {
		local = filepath.Join(base, "node-runtime", "bin", "node")
	}
	if _, err := os.Stat(local); err == nil {
		return local
	}
	return ""
}

type entreeDist struct {
	Version string `json:"version"`
	LTS     any    `json:"lts"`
}

func telechargerNode(base string) string {
	client := &http.Client{Timeout: 120 * time.Second}
	fmt.Println("Récupération de la liste des versions LTS de Node.js...")
	resp, err := client.Get("https://nodejs.org/dist/index.json")
	if err != nil {
		fmt.Println("ERREUR réseau (nodejs.org) :", err)
		return ""
	}
	defer resp.Body.Close()
	var entrees []entreeDist
	if err := json.NewDecoder(resp.Body).Decode(&entrees); err != nil {
		fmt.Println("ERREUR lecture index.json :", err)
		return ""
	}
	version := ""
	for _, e := range entrees {
		if e.LTS == nil || e.LTS == false {
			continue
		}
		majeure := strings.TrimPrefix(e.Version, "v")
		majeure = strings.SplitN(majeure, ".", 2)[0]
		if n := atoi(majeure); n >= 20 {
			version = e.Version
			break
		}
	}
	if version == "" {
		version = entrees[0].Version
	}
	fmt.Println("Téléchargement de Node.js", version, "...")
	arch := "win-x64"
	if runtime.GOOS == "linux" {
		arch = "linux-x64"
	} else if runtime.GOOS == "darwin" {
		arch = "darwin-x64"
	}
	url := fmt.Sprintf("https://nodejs.org/dist/%s/node-%s-%s.zip", version, strings.TrimPrefix(version, "v"), arch)
	resp2, err := client.Get(url)
	if err != nil {
		fmt.Println("ERREUR téléchargement :", err)
		return ""
	}
	defer resp2.Body.Close()
	if resp2.StatusCode != 200 {
		fmt.Println("ERREUR HTTP", resp2.StatusCode, "pour", url)
		return ""
	}
	tmp := filepath.Join(os.TempDir(), "node-dist.zip")
	f, err := os.Create(tmp)
	if err != nil {
		return ""
	}
	if _, err := io.Copy(f, resp2.Body); err != nil {
		f.Close()
		return ""
	}
	f.Close()
	fmt.Println("Extraction dans", filepath.Join(base, "node-runtime"), "...")
	if err := extraireZip(tmp, filepath.Join(base, "node-runtime")); err != nil {
		fmt.Println("ERREUR extraction :", err)
		return ""
	}
	os.Remove(tmp)
	return trouverNode(base)
}

func atoi(s string) int {
	n := 0
	for _, c := range s {
		if c < '0' || c > '9' {
			break
		}
		n = n*10 + int(c-'0')
	}
	return n
}

func extraireZip(src, dest string) error {
	r, err := zip.OpenReader(src)
	if err != nil {
		return err
	}
	defer r.Close()
	for _, f := range r.File {
		// retire le dossier racine de l'archive (node-vX-win-x64/...)
		rel := f.Name
		if idx := strings.Index(rel, "/"); idx >= 0 {
			rel = rel[idx+1:]
		}
		if rel == "" {
			continue
		}
		chemin := filepath.Join(dest, rel)
		if f.FileInfo().IsDir() {
			os.MkdirAll(chemin, 0755)
			continue
		}
		os.MkdirAll(filepath.Dir(chemin), 0755)
		rc, err := f.Open()
		if err != nil {
			return err
		}
		w, err := os.Create(chemin)
		if err != nil {
			rc.Close()
			return err
		}
		_, err = io.Copy(w, rc)
		rc.Close()
		w.Close()
		if err != nil {
			return err
		}
	}
	return nil
}

func lancer(base, commande string, args ...string) bool {
	fmt.Println(">", commande, strings.Join(args, " "))
	cmd := exec.Command(commande, args...)
	cmd.Dir = base
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	if err := cmd.Run(); err != nil {
		fmt.Println("ERREUR :", err)
		return false
	}
	return true
}

func main() {
	flag.Parse()
	base, err := os.Executable()
	if err != nil {
		base, _ = os.Getwd()
	} else {
		base = filepath.Dir(base)
	}
	fmt.Println("============================================")
	fmt.Println("  GENESIS — lanceur 1 clic")
	fmt.Println("  dossier du jeu :", base)
	fmt.Println("============================================")

	node := trouverNode(base)
	if node == "" {
		fmt.Println("Node.js non trouvé sur ce PC : téléchargement automatique...")
		node = telechargerNode(base)
		if node == "" {
			fmt.Println("Impossible d'installer Node.js automatiquement. Installez Node.js LTS manuellement puis relancez.")
			pause()
			os.Exit(1)
		}
	}
	if out, err := exec.Command(node, "--version").Output(); err == nil {
		fmt.Println("Node.js :", strings.TrimSpace(string(out)))
	}
	if *checkOnly {
		fmt.Println("Mode -check : vérification OK.")
		return
	}

	nodeDir := filepath.Dir(node)
	npm := filepath.Join(nodeDir, "npm.cmd")
	if runtime.GOOS != "windows" {
		npm = filepath.Join(nodeDir, "npm")
	}

	electronBinaire := filepath.Join(base, "node_modules", "electron", "dist", "electron.exe")
	if runtime.GOOS != "windows" {
		electronBinaire = filepath.Join(base, "node_modules", "electron", "dist", "electron")
	}
	if _, err := os.Stat(electronBinaire); os.IsNotExist(err) {
		fmt.Println("Dépendances absentes : npm install (cela peut prendre quelques minutes)...")
		if !lancer(base, npm, "install", "--no-audit", "--no-fund") {
			pause()
			os.Exit(1)
		}
	} else {
		fmt.Println("Dépendances déjà présentes.")
	}

	fmt.Println("Compilation du jeu...")
	if !lancer(base, npm, "run", "build") {
		pause()
		os.Exit(1)
	}

	fmt.Println("Lancement de Genesis...")
	electronCmd := filepath.Join(base, "node_modules", ".bin", "electron.cmd")
	if runtime.GOOS != "windows" {
		electronCmd = filepath.Join(base, "node_modules", ".bin", "electron")
	}
	if _, err := os.Stat(electronCmd); err != nil {
		electronCmd = node
		lancer(base, electronCmd, filepath.Join(base, "node_modules", "electron", "dist", "electron.exe"), ".")
	} else {
		lancer(base, electronCmd, ".")
	}
}
