﻿/**
 * 批量下載ハーメルン - SS･小説投稿サイト- 小説的工具。 Download Hameln novels.
 */

'use strict';

require('./comic loder.js');

// ----------------------------------------------------------------------------

CeL.run([ 'application.storage.EPUB'
// .to_file_name()
, 'application.net',
// CeL.detect_HTML_language()
, 'application.locale' ]);

var Hameln = new CeL.comic.site({
	// recheck:從頭檢測所有作品之所有章節。
	// 'changed': 若是已變更，例如有新的章節，則重新下載/檢查所有章節內容。
	recheck : 'changed',

	// one_by_one : true,
	base_URL : 'https://syosetu.org/',

	// 解析 作品名稱 → 作品id get_work()
	search_URL : '?mode=search&word=',
	parse_search_result : function(html) {
		var id_data = [],
		// {Array}id_list = [id,id,...]
		id_list = [], get_next_between = html.all_between(
				'<div class="float hide blo_title_base">', '</a>'), text;
		while ((text = get_next_between()) !== undefined) {
			id_list.push(
			//
			text.between(' href="//novel.syosetu.org/', '/"') | 0);
			id_data.push(text.between('<b>', '</b>'));
		}
		return [ id_list, id_data ];
	},

	// 取得作品的章節資料。 get_work_data()
	work_URL : function(work_id) {
		return '?mode=ss_detail&nid=' + work_id;
	},
	parse_work_data : function(html, get_label) {
		html = html.between('<table width=100% class=table1>', '</div>');
		var work_data = CeL.null_Object(), matched, PATTERN =
		//
		/<td bgcolor=#DDDDDD[^<>]*>([^<>]+)<\/td><td[^<>]*>(.+?)<\/td>/g;

		while (matched = PATTERN.exec(html)) {
			work_data[matched[1]] = get_label(matched[2]);
		}

		work_data = Object.assign({
			// 必要屬性：須配合網站平台更改。
			title : work_data.タイトル,

			// 選擇性屬性：須配合網站平台更改。
			// e.g., 连载中, 連載中
			status : work_data.状態.split(','),
			author : work_data.作者,
			last_update : work_data.最新投稿,
			description : work_data.あらすじ,
			site_name : 'ハーメルン'
		}, work_data);

		if (work_data.タグ) {
			work_data.status.append(work_data.タグ.split(/\s+/));
		}
		if (work_data.警告タグ) {
			work_data.status.append(work_data.警告タグ.split(/\s+/));
		}
		work_data.status = work_data.status.filter(function(item) {
			return !!item;
		}).join(',');

		return work_data;
	},
	// 對於章節列表與作品資訊分列不同頁面(URL)的情況，應該另外指定.chapter_list_URL。
	chapter_list_URL : function(work_id) {
		return 'https://novel.syosetu.org/' + work_id + '/';
	},
	get_chapter_count : function(work_data, html) {
		CeL.get_URL(this.base_URL + '?mode=ss_view_all&nid=' + work_data.id,
		// save full text 一括表示
		null, null, null, {
			write_to : this.main_directory + this.cache_directory_name
					+ work_data.directory_name + '.full_text.htm'
		});

		// TODO: 對於單話，可能無目次。
		// e.g., https://novel.syosetu.org/106514/

		// e.g., 'ja-JP'
		var language = CeL.detect_HTML_language(html);
		html = html.between('<table width=100%>', '</div>');
		work_data.chapter_list = [];
		var part_title,
		//
		get_next_between = html.all_between('<tr', '</tr>'), text;
		while ((text = get_next_between()) !== undefined) {
			if (text.includes('<td colspan=2><strong>')) {
				part_title = text.between('<strong>', '</strong>');
				continue;
			}

			// [ , href, inner ]
			var matched = text.match(/ href=([^ "<>]+)[^<>]*>(.+?)<\/a>/);
			if (!matched) {
				throw text;
			}

			var chapter_data = {
				part_title : part_title,
				url : matched[1].replace(/^\.\//, ''),
				date : [ text.match(/>\s*(2\d{3}年[^"<>]+?)</)[1]
				//
				.to_Date({
					zone : 9
				}) ],
				title : matched[2]
			};
			if (matched = text.match(/ title="(2\d{3}年[^"<>]+?)改稿"/)) {
				chapter_data.date.push(matched[1].to_Date({
					zone : 9
				}) || matched[1]);
			}
			work_data.chapter_list.push(chapter_data);
			// console.log(chapter_data);
		}
		work_data.chapter_count = work_data.chapter_list.length;

		work_data.ebook = new CeL.EPUB(work_data.directory
				+ work_data.directory_name, {
			// start_over : true,
			// 小説ID
			identifier : work_data.id,
			title : work_data.title,
			language : language
		});
		// http://www.idpf.org/epub/31/spec/epub-packages.html#sec-opf-dcmes-optional
		work_data.ebook.set({
			// 作者名
			creator : work_data.author,
			// 出版時間 the publication date of the EPUB Publication.
			date : CeL.EPUB.date_to_String(work_data.last_update.to_Date({
				zone : 9
			})),
			// ジャンル, タグ, キーワード
			subject : work_data.status,
			// あらすじ
			description : work_data.description,
			publisher : work_data.site_name + ' (' + this.base_URL + ')',
			source : work_data.url
		});

		if (work_data.image) {
			work_data.ebook.set_cover(work_data.image);
		}
	},

	// 取得每一個章節的各個影像內容資料。 get_chapter_data()
	chapter_URL : function(work_data, chapter) {
		return this.chapter_list_URL(work_data.id)
				+ work_data.chapter_list[chapter - 1].url;
	},
	parse_chapter_data : function(html, work_data, get_label, chapter) {
		// 檢測所取得內容的章節編號是否相符。
		var text = get_label(html.between(
				'<div style="text-align:right;font-size:80%">', '/')) | 0;
		if (chapter !== text) {
			throw new Error('Different chapter: Should be ' + chapter
					+ ', get ' + text + ' inside contents.');
		}

		text = html
		//
		.between('<div class="ss">', '<span id="analytics_end">')
		// remove </div>
		.between(null, {
			tail : '</div>'
		})
		// remove chapter title
		.replace(/<p><span style="font-size:120%">.+?<\/p>/, '')
		// remove chapter count (e.g., 1 / 1)
		.replace(
		//
		/<div style="text-align:right;font-size:80%">[\d\s\/]+?<\/div>/, '')
		// e.g., id="text" → id="text"
		.replace(/ (id)=([a-z]+)/g, ' $1="$2"')
		// remove chapter title @ contents
		.replace(
				/[\s\n]+<span style="font-size:120%">(?:.+?)<\/span><BR><BR>/g,
				'');

		var chapter_data = work_data.chapter_list[chapter - 1],
		//
		part_title = chapter_data.part_title,
		//
		chapter_title = chapter_data.title,
		//
		file_title = chapter.pad(3) + ' '
				+ (part_title ? part_title + ' - ' : '') + chapter_title,
		//
		item = work_data.ebook.add({
			title : file_title,
			internalize_media : true,
			file : CeL.to_file_name(file_title + '.xhtml'),
			date : work_data.chapter_list[chapter - 1].date
		}, {
			title : part_title,
			sub_title : chapter_title,
			text : text
		});
	},
	finish_up : function(work_data) {
		if (work_data) {
			work_data.ebook.pack([ this.main_directory,
			//
			'(一般小説) [' + work_data.author + '] ' + work_data.title
			//
			+ ' [' + work_data.site_name + ' '
			//
			+ work_data.last_update.to_Date({
				zone : 9
			}).format('%Y%2m%2d') + '].' + work_data.id + '.epub' ],
					this.remove_ebook_directory);
		}
	}
});

// ----------------------------------------------------------------------------

// CeL.set_debug(3);

Hameln.start(work_id);
