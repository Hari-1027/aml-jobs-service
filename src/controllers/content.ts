import logger from '../utils/logger';
import * as _ from 'lodash';
import * as uuid from 'uuid';
import { uploadMediaFile } from '../services/awsService';
import { updateProcess } from '../services/process';
import { contentStageMetaData, createContentStage, getAllStageContent, updateContentStage } from '../services/contentStage';
import { createContent } from '../services/content';
import { ContentStage } from '../models/contentStage';
import { updateQuestionStage } from '../services/questionStage';
import { getCSVTemplateHeader, getCSVHeaderAndRow, validHeader, processRow, convertToCSV, preloadData } from '../services/util';
import { Status } from '../enums/status';

let mediaEntries: any[];
let Process_id: string;

export const handleContentCsv = async (contentsCsv: object[], media: any, process_id: string) => {
  Process_id = process_id;
  mediaEntries = media;
  let contentsData: object[] = [];
  if (contentsCsv.length === 0) {
    logger.error(`${Process_id} Content data validation resulted in empty data.`);
    return {
      error: { errStatus: 'Empty', errMsg: 'empty content set data found' },
      result: {
        isValid: false,
        data: null,
      },
    };
  }
  for (const contents of contentsCsv) {
    const validContentData = await validateCSVContentHeaderRow(contents);
    if (!validContentData.result.isValid) {
      logger.error('Content csv::error while progressing data');
      return validContentData;
    }
    const {
      result: { data },
    } = validContentData;
    const validData = contentRowHeaderProcess(data?.rows, data?.header);
    if (!validData.result.isValid) {
      logger.error('error while processing data');
      return validData;
    }
    const { result } = validData;
    contentsData = contentsData.concat(result.data);
    if (contentsData.length === 0) {
      logger.error('Error while processing the content csv data');
      return {
        error: { errStatus: 'Empty', errMsg: 'empty question set data found' },
        result: {
          isValid: false,
        },
      };
    }
  }
  logger.info('Insert content Stage::content Data ready for bulk insert');

  const createContent = await insertBulkContentStage(contentsData);
  if (!createContent.result.isValid) {
    logger.error('Error while creating stage question table');
    return createContent;
  }
  const validateContent = await validateContentStage();

  if (!validateContent.result.isValid) {
    logger.error('Content Validation::Error while validating stage content data');
    const uploadContent = await uploadContentStage();
    if (!uploadContent.result.isValid) return uploadContent;
    return validateContent;
  }
  const contentMedia = await contentsMediaProcess();
  if (!contentMedia.result.isValid) {
    logger.error('Error while validating stage content media');
    return contentMedia;
  }
  const mainQuestionSet = await insertContentMain();
  return mainQuestionSet;
};

const validateCSVContentHeaderRow = async (contentEntry: any) => {
  const templateHeader = await getCSVTemplateHeader(contentEntry.entryName);
  if (!templateHeader.result.isValid) {
    return {
      error: { errStatus: 'Template missing', errMsg: 'template missing' },
      result: {
        isValid: false,
        data: null,
      },
    };
  }
  const contentRowHeader = getCSVHeaderAndRow(contentEntry);
  if (!contentRowHeader.result.isValid) {
    logger.error('Content Row/Header:: Template header, header, or rows are missing');
    return contentRowHeader;
  }

  const {
    result: {
      data: { header },
    },
  } = contentRowHeader;

  const isValidHeader = validHeader(contentEntry.entryName, header, templateHeader.result.data);
  if (!isValidHeader.result.isValid) {
    logger.error('Content Row/Header:: Header validation failed');
    return isValidHeader;
  }

  logger.info(`content Row/Header:: Row and Header mapping process started for ${Process_id} `);
  return {
    error: { errStatus: null, errMsg: null },
    result: {
      isValid: true,
      data: contentRowHeader.result.data,
    },
  };
};

const contentRowHeaderProcess = (rows: any, header: any) => {
  const processData = processRow(rows, header);
  if (!processData || processData.length === 0) {
    logger.error('Content Row/Header:: Row processing failed or returned empty data');
    return {
      error: { errStatus: 'process_error', errMsg: 'Row processing failed or returned empty data' },
      result: {
        isValid: false,
        data: processData,
      },
    };
  }
  logger.info('Insert content Stage:: Data ready for bulk insert to staging.');
  return {
    error: { errStatus: null, errMsg: null },
    result: {
      isValid: true,
      data: processData,
    },
  };
};

const insertBulkContentStage = async (insertData: object[]) => {
  const contentStage = await insertContentStage(insertData);
  if (!contentStage.result.isValid) {
    logger.error('Insert content Stage:: Failed to insert process data into staging');
    return contentStage;
  }

  logger.info(`Validate Content Stage::Staged contents Data ready for validation`);
  return {
    error: { errStatus: null, errMsg: null },
    result: {
      isValid: true,
      data: null,
    },
  };
};

const validateContentStage = async () => {
  const validContentStage = await validateContentStageData();
  if (!validContentStage.result.isValid) {
    logger.error(`Validate Content Stage:: ${Process_id} staging data are invalid`);
  }
  logger.info(`Upload Cloud::Staging Data ready for upload in cloud`);
  return validContentStage;
};

const uploadContentStage = async () => {
  const getContents = await getAllStageContent();
  if (getContents.error) {
    logger.error('unexpected error occurred while get all stage data');
    return {
      error: { errStatus: 'unexpected_error', errMsg: 'unexpected error occurred while get all stage data' },
      result: {
        isValid: false,
        data: null,
      },
    };
  }
  await updateProcess(Process_id, { content_error_file_name: 'content.csv', status: Status.ERROR });
  const uploadContent = await convertToCSV(getContents, 'contents');
  if (!uploadContent) {
    logger.error('Upload Cloud::Unexpected error occurred while upload to cloud');
    return {
      error: { errStatus: 'unexpected_error', errMsg: 'unexpected error occurred while upload to cloud' },
      result: {
        isValid: false,
        data: null,
      },
    };
  }
  logger.info('Content csv upload:: all the data are validated successfully and uploaded to cloud for reference');
  logger.info(`Content Media upload:: ${Process_id} content Stage data is ready for upload media to cloud`);
  return {
    error: { errStatus: null, errMsg: null },
    result: {
      isValid: true,
      data: null,
    },
  };
};

const contentsMediaProcess = async () => {
  try {
    const getContents = await getAllStageContent();
    if (getContents.error) {
      logger.error('unexpected error occurred while get all stage data');
      return {
        error: { errStatus: 'unexpected_error', errMsg: 'unexpected error occurred while get all stage data' },
        result: {
          isValid: false,
          data: null,
        },
      };
    }

    for (const content of getContents) {
      if (content.media_files?.length > 0) {
        const mediaFiles = await Promise.all(
          content.media_files.map(async (o: string) => {
            const foundMedia = mediaEntries.slice(1).find((media: any) => {
              return media.entryName.split('/')[1] === o;
            });
            if (foundMedia) {
              const mediaData = await uploadMediaFile(foundMedia, 'content');
              if (!mediaData) {
                logger.error(`Media upload failed for ${o}`);
                return null;
              }
              return mediaData;
            }
            return null;
          }),
        );
        if (mediaFiles.every((file) => file === null)) {
          logger.warn(`No valid media files found for content ID: ${content.id}`);
          continue;
        }
        const validMediaFiles = mediaFiles.filter((file: any) => file !== null);
        if (validMediaFiles.length === 0) {
          return {
            error: { errStatus: 'Empty', errMsg: 'No media found for the question' },
            result: {
              isValid: false,
              data: null,
            },
          };
        }
        const updateContent = await updateContentStage({ id: content.id }, { media_files: validMediaFiles });
        if (updateContent.error) {
          logger.error('Content Media upload:: Media validation or update failed');
        }
      }
    }

    logger.info('Content Media upload:: Media inserted and updated in the stage table');
    logger.info(`Content Main Insert::${Process_id} is Ready for inserting bulk upload to question`);
    return {
      error: { errStatus: null, errMsg: null },

      result: {
        isValid: true,
        data: null,
      },
    };
  } catch (error: any) {
    logger.error(`An error occurred in contentsMediaProcess: ${error.message}`);
    return {
      error: { errStatus: null, errMsg: null },

      result: {
        isValid: false,
        data: null,
      },
    };
  }
};

const insertContentMain = async () => {
  const insertToMainContent = await stageDataToContent();
  if (!insertToMainContent.result.isValid) {
    logger.error(`Content Main Insert::${Process_id} staging data are invalid for main question insert`);
    return insertToMainContent;
  }

  logger.info(`Content Main insert:: bulk upload completed  for Process ID: ${Process_id}`);
  await ContentStage.truncate({ restartIdentity: true });
  logger.info(`Completed:: ${Process_id} Content csv uploaded successfully`);
  return {
    error: { errStatus: null, errMsg: null },
    result: {
      isValid: true,
      data: null,
    },
  };
};

const insertContentStage = async (insertData: object[]) => {
  const contentStage = await createContentStage(insertData);
  if (contentStage.error) {
    logger.error(`Insert Content Staging:: ${Process_id} content bulk data error in inserting`);
    return {
      error: { errStatus: 'errored', errMsg: 'content bulk data error in inserting' },
      result: {
        isValid: false,
        data: null,
      },
    };
  }
  logger.info(`Insert Content Staging:: ${Process_id} content bulk data inserted successfully to staging table `);
  return {
    error: { errStatus: null, errMsg: null },
    result: {
      isValid: true,
      data: null,
    },
  };
};

const validateContentStageData = async () => {
  const getAllContentStage = await contentStageMetaData({ process_id: Process_id });
  let isValid = true;
  if (getAllContentStage.error) {
    logger.error(`Validate Content Stage:: ${Process_id} ,the csv Data is invalid format or errored fields`);
    return {
      error: { errStatus: 'error', errMsg: `content Stage data  unexpected error .` },
      result: {
        isValid: false,
        data: null,
      },
    };
  }
  if (_.isEmpty(getAllContentStage)) {
    logger.error(`Validate content Stage:: ${Process_id} ,staging Data is empty invalid format or errored fields`);
    return {
      error: { errStatus: 'error', errMsg: `content Stage data unexpected error .` },
      result: {
        isValid: false,
        data: null,
      },
    };
  }
  for (const content of getAllContentStage) {
    const { id, content_id, L1_skill } = content;
    const checkRecord = await contentStageMetaData({ content_id, L1_skill });
    if (checkRecord.length > 1) {
      await updateQuestionStage(
        { id },
        {
          status: 'errored',
          error_info: 'Duplicate content_id found.',
        },
      );
      isValid = false;
    }
  }

  logger.info(`Validate Content Stage:: ${Process_id} , the staging Data content is valid`);
  return {
    error: { errStatus: null, errMsg: null },
    result: {
      isValid: isValid,
      data: null,
    },
  };
};

export const stageDataToContent = async () => {
  const getAllContentStage = await contentStageMetaData({ process_id: Process_id });
  if (getAllContentStage.error) {
    logger.error(`Insert Content main:: ${Process_id} content bulk data error in inserting to main table`);
    return {
      error: { errStatus: 'errored', errMsg: 'content bulk data error in inserting' },
      result: {
        isValid: false,
        data: null,
      },
    };
  }
  const insertData = await formatContentStageData(getAllContentStage);
  if (!insertData) {
    return {
      error: { errStatus: 'process_stage_data', errMsg: 'Error in formatting staging data to main table.' },
      result: {
        isValid: false,
        data: null,
      },
    };
  }
  const contentInsert = await createContent(insertData);
  if (contentInsert.error) {
    logger.error(`Insert Content main:: ${Process_id} content bulk data error in inserting to main table`);
    return {
      error: { errStatus: 'errored', errMsg: 'content bulk data error in inserting' },
      result: {
        isValid: false,
        data: null,
      },
    };
  }
  return {
    error: { errStatus: null, errMsg: null },
    result: {
      isValid: true,
      data: null,
    },
  };
};

const formatContentStageData = async (stageData: any[]) => {
  const { boards, classes, skills, subSkills, repositories } = await preloadData();

  const transformedData = stageData.map((obj) => {
    const transferData = {
      identifier: uuid.v4(),
      content_id: obj.content_id,
      name: { en: obj.title || obj.question_text },
      description: { en: obj.description },
      tenant: '',
      repository: repositories.find((repository: any) => repository.name.en === obj.repository_name),
      taxonomy: {
        board: boards.find((board: any) => board.name.en === obj.board),
        class: classes.find((Class: any) => Class.name.en === obj.class),
        l1_skill: skills.find((skill: any) => skill.name.en == obj.L1_skill),
        l2_skill: obj.L2_skill.map((skill: string) => skills.find((Skill: any) => Skill.name.en === skill)),
        l3_skill: obj.L3_skill.map((skill: string) => skills.find((Skill: any) => Skill.name.en === skill)),
      },
      sub_skills: obj.sub_skills.map((subSkill: string) => subSkills.find((sub: any) => sub.name.en === subSkill)),
      gradient: obj.gradient,
      status: 'draft',
      media: obj.media_files,
      created_by: 1,
      is_active: true,
    };
    return transferData;
  });
  logger.info('Data transfer:: staging Data transferred as per original format');
  return transformedData;
};
